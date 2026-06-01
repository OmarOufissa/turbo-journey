#!/usr/bin/env python3
"""
Full PDF processing pipeline for habilitation certificates.
Implements steps 1-10 of the processing specification.
Step 8 (DB update) writes process-report.json consumed by import-pdfs.ts migration.

Usage:
  python3 scripts/process-pdfs.py [--raw-dir /path/to/pdfs] [--uploads-dir /path/to/uploads]
"""

import os
import re
import sys
import json
import shutil
import subprocess
import tempfile
import argparse
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
from datetime import datetime, timezone
from PIL import Image, ImageFilter, ImageEnhance

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "raw-pdfs"
UPLOADS_DIR = BASE_DIR / "uploads" / "pdfs"
REPORTS_DIR = BASE_DIR / "reports"        # tracked by git
REPORT_PATH = UPLOADS_DIR / "process-report.json"   # consumed by import-pdfs.ts
REVIEW_PATH = REPORTS_DIR / "review-queue.json"      # viewable on GitHub

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
MIN_PHOTO_CHARS = 80          # fewer chars → flagged as photo/unreadable
CERT_CONFIDENCE_THRESHOLD = 60  # >= this → habilitation cert
UNCERTAIN_THRESHOLD = 30      # between this and CERT → uncertain (review)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class PageInfo:
    pdf_file: str
    page_num: int           # 1-indexed
    char_count: int = 0
    is_photo: bool = False
    is_habilitation: bool = False
    confidence: float = 0.0
    matricule: Optional[str] = None
    matricule_raw: Optional[str] = None
    candidate_matricules: list = field(default_factory=list)
    review_reasons: list = field(default_factory=list)
    text_excerpt: str = ""

@dataclass
class Certificate:
    matricule: str
    matricule_raw: str
    pages: list             # list of {"file": str, "page": int}
    page_count: int = 1
    output_file: str = ""
    version: int = 1

@dataclass
class ReviewItem:
    review_type: str        # no_matricule | multiple_matricules | uncertain | no_match | ambiguous_pair
    pdf_file: str
    page_num: int
    reason: str
    confidence: float = 0.0
    matricule: Optional[str] = None
    text_excerpt: str = ""

# ---------------------------------------------------------------------------
# Step 1: OCR
# ---------------------------------------------------------------------------
def ocr_page(ppm_path: str) -> str:
    """OCR a page image, trying multiple approaches for best quality."""
    # Primary: french language
    result = subprocess.run(
        ["tesseract", ppm_path, "stdout", "-l", "fra", "--psm", "3"],
        capture_output=True, text=True, timeout=60
    )
    text = result.stdout.strip()

    # If too little text, try PSM 6 (uniform block)
    if len(text) < MIN_PHOTO_CHARS:
        result2 = subprocess.run(
            ["tesseract", ppm_path, "stdout", "-l", "fra", "--psm", "6"],
            capture_output=True, text=True, timeout=60
        )
        if len(result2.stdout.strip()) > len(text):
            text = result2.stdout.strip()

    return text


def enhance_image(ppm_path: str, out_path: str) -> None:
    """Apply light contrast enhancement to improve OCR on poor scans."""
    try:
        img = Image.open(ppm_path).convert("L")  # grayscale
        img = ImageEnhance.Contrast(img).enhance(1.5)
        img = img.filter(ImageFilter.SHARPEN)
        img.save(out_path)
    except Exception:
        shutil.copy2(ppm_path, out_path)


def ocr_page_enhanced(ppm_path: str, tmpdir: str) -> str:
    """Try standard OCR; if low confidence, try enhanced image."""
    text = ocr_page(ppm_path)
    if len(text) >= MIN_PHOTO_CHARS:
        return text

    enhanced = os.path.join(tmpdir, "enhanced.ppm")
    enhance_image(ppm_path, enhanced)
    text2 = ocr_page(enhanced)
    os.unlink(enhanced)
    return text2 if len(text2) > len(text) else text


# ---------------------------------------------------------------------------
# Step 2: Classification
# ---------------------------------------------------------------------------
CERT_KEYWORDS = [
    (r"titre\s+d.habilitation", 70),
    (r"titre\s+d\s+habilitation", 70),
    (r"\bhabilitation\s+[néelectriquN]", 25),
    (r"\bhabilitation\b", 15),
    (r"nom\s+et\s+pr.nom", 8),
    (r"\bmatricule\b", 10),
    (r"champ\s+d.application", 8),
    (r"date\s+de\s+d.livrance", 5),
    (r"valable\s+jusqu", 5),
    (r"symbole\s+d.habilitation|personnel\s+d.habilitation", 5),
    (r"domaine\s+de\s+tension", 5),
    (r"onee|branche\s+.lectricit", 3),
]

ANTI_KEYWORDS = [
    (r"visite\s+m.dicale|m.decin\s+du\s+travail|aptitude\s+m.dicale", -100),
    (r"examen\s+m.dical|certificat\s+m.dical", -100),
    (r"fiche\s+de\s+s.curit|fiche\s+accident", -80),
    (r"programme\s+de\s+formation|attestation\s+de\s+formation", -60),
    (r"proc.s.verbal|convocation", -50),
    (r"\bexamen\b.*\bth.orique\b|\bexamen\b.*\bpratique\b", -50),
    (r"r.sultat\s+de\s+l.examen|.preuves?\s+.crites?", -50),
    (r"bulletin\s+de\s+salaire|fiche\s+de\s+paie", -100),
    (r"contrat\s+de\s+travail", -100),
]

BACK_PAGE_KEYWORDS = [
    r"suite\b|recto|verso|page\s+2",
    r"remarques?\s*:", r"observations?\s*:",
    r"visa\s+du|signature\s+du",
    r"annexe\b",
]

AVIS_PATTERNS = [
    r"le\s+pr.sent\s+titre\s+d.habilitation\s+est\s+.tabli",
    r"ce\s+titre\s+est\s+strictement\s+personnel",
    r"titulaire\s+doit\s+.tre\s+porteur",
    r"perte\s+.ventuelle\s+de\s+ce\s+titre",
]

def is_avis_page(text: str) -> bool:
    """Detect the standard AVIS/legal-notice back page that accompanies each certificate."""
    text_lower = text.lower()
    matches = sum(1 for p in AVIS_PATTERNS if re.search(p, text_lower))
    return matches >= 2


def classify_page(text: str) -> tuple[float, list[str]]:
    """
    Returns (confidence_score, review_reasons).
    confidence >= CERT_CONFIDENCE_THRESHOLD → habilitation cert.

    A real certificate MUST have:
      - "Titre d'habilitation" as a title/header
      - "Nom et Prénom" (employee name section)
      - "Matricule" (employee ID field)
    Without all three, it is NOT a certificate regardless of other content.
    """
    text_lower = text.lower()
    reasons = []

    # Hard requirements — all three must be present
    has_title = bool(re.search(r"titre\s+d.habilitation|titre\s+d\s+habilitation", text_lower))
    has_nom = bool(re.search(r"nom\s+et\s+pr.nom", text_lower))
    has_mat = bool(re.search(r"\bmatricule\b|\bmatr?\b|\bmle\b", text_lower))

    if not (has_title and has_nom and has_mat):
        return 0.0, reasons

    # Soft scoring for confidence
    score = 70.0  # base: all three hard requirements met

    if re.search(r"champ\s+d.application|domaine\s+de\s+tension", text_lower):
        score += 10
    if re.search(r"date\s+de\s+d.livrance|valable\s+jusqu", text_lower):
        score += 10
    if re.search(r"symbole\s+d.habilitation|personnel\s+d.habilitation", text_lower):
        score += 10

    # Anti-keywords
    for pattern, weight in ANTI_KEYWORDS:
        if re.search(pattern, text_lower):
            score += weight
            reasons.append(f"Anti-keyword: {pattern}")

    return score, reasons


def is_back_page_candidate(text: str) -> bool:
    """Returns True if the page looks like it could be the back of a cert."""
    text_lower = text.lower()
    return any(re.search(p, text_lower) for p in BACK_PAGE_KEYWORDS)


# ---------------------------------------------------------------------------
# Step 3: Matricule extraction
# ---------------------------------------------------------------------------
MATRICULE_PATTERNS = [
    # Pattern, prefix to strip before capturing the number+optional letter
    r"(?:n[°o]\s*)?matricule\s*[:\-]?\s*([0-9OIl]{4,6}[A-Z]?)",
    r"\bmatr?\s*[:\-]?\s*([0-9OIl]{4,6}[A-Z]?)",
    r"\bmtrcl\s*[:\-]?\s*([0-9OIl]{4,6}[A-Z]?)",
    r"\bm\.le\s*[:\-]?\s*([0-9OIl]{4,6}[A-Z]?)",
    r"\bmle\s*[:\-]?\s*([0-9OIl]{4,6}[A-Z]?)",
]

OCR_CORRECTIONS = str.maketrans({
    'O': '0', 'I': '1', 'l': '1',
})


def normalize_raw(raw: str) -> str:
    """Apply OCR error corrections to a raw matricule string."""
    digits = raw[:-1].translate(OCR_CORRECTIONS) if raw and raw[-1].isalpha() else raw.translate(OCR_CORRECTIONS)
    suffix = raw[-1] if raw and raw[-1].isalpha() else ""
    return digits + suffix


def extract_matricule(text: str) -> tuple[Optional[str], Optional[str], list[str]]:
    """
    Returns (normalized_matricule, raw_text, all_candidates).

    Strategy: find every occurrence of a 'Matricule' label in the text, then
    search a 400-character window AFTER it for a 5-digit number.  This handles
    the common two-column layout where the label and value are separated by
    many lines (Direction, logo noise, etc.).

    We then pick the candidate closest in character distance to 'Nom et Prénom'
    (the employee header) to avoid picking up numbers from the certifying-
    officer or other sections.
    """
    # Build a flat version of the text with multiple spaces collapsed
    flat = re.sub(r'\s+', ' ', text)

    candidates: dict[str, tuple[str, int]] = {}  # normalized → (raw, char_pos_in_flat)

    # 1) Try inline patterns first (Matricule : 83192 on same logical line)
    for pattern in MATRICULE_PATTERNS:
        for m in re.finditer(pattern, flat, re.IGNORECASE):
            raw = m.group(1).strip()
            normalized = normalize_raw(raw)
            if re.match(r'^\d{5}[A-Z]?$', normalized) and normalized not in candidates:
                candidates[normalized] = (raw, m.start())

    # 2) Window search: for every "Matricule" label not already caught, search
    #    the next 400 characters for a 5-digit number.
    for lm in re.finditer(r'matricule\s*[:\-]?', flat, re.IGNORECASE):
        window_start = lm.end()
        window = flat[window_start: window_start + 400]
        # Skip if we already captured a candidate starting very close
        already = any(abs(pos - window_start) < 50 for _, (_, pos) in candidates.items()
                      if pos >= window_start)
        if already:
            continue
        nm = re.search(r'\b([0-9OIl]{5}[A-Z]?)\b', window)
        if nm:
            raw = nm.group(1).strip()
            normalized = normalize_raw(raw)
            if re.match(r'^\d{5}[A-Z]?$', normalized) and normalized not in candidates:
                candidates[normalized] = (raw, window_start + nm.start())

    if not candidates:
        return None, None, []

    all_normalized = list(candidates.keys())

    if len(candidates) == 1:
        norm, (raw, _) = next(iter(candidates.items()))
        return norm, raw, all_normalized

    # Multiple candidates: pick the one whose position in the flat text is
    # closest to the "Nom et Prénom" anchor (employee header section).
    nom_pos = None
    nm2 = re.search(r'nom\s+et\s+pr.nom', flat, re.IGNORECASE)
    if nm2:
        nom_pos = nm2.start()

    if nom_pos is not None:
        # Prefer candidate whose char position is close to (and after) nom_pos
        best = min(candidates.items(),
                   key=lambda kv: abs(kv[1][1] - nom_pos))
        norm, (raw, _) = best
        return norm, raw, all_normalized

    # Fallback: earliest in the document
    best = min(candidates.items(), key=lambda kv: kv[1][1])
    norm, (raw, _) = best
    return norm, raw, all_normalized


# ---------------------------------------------------------------------------
# Step 4: Front/back detection
# ---------------------------------------------------------------------------
def detect_back_page(prev_page: PageInfo, curr_page: PageInfo) -> tuple[bool, float]:
    """
    Returns (is_back_page, confidence).
    Only called when curr_page is NOT classified as a habilitation cert.
    """
    if curr_page.is_photo or curr_page.char_count < MIN_PHOTO_CHARS:
        return False, 0.0
    if curr_page.confidence < -20:  # strong anti-keyword match
        return False, 0.0

    score = 0.0
    text_lower = curr_page.text_excerpt.lower() if hasattr(curr_page, '_full_text') else ""

    if is_back_page_candidate(curr_page.text_excerpt):
        score += 50.0
    if curr_page.char_count > MIN_PHOTO_CHARS and curr_page.char_count < 800:
        score += 20.0  # back pages tend to be sparse
    if curr_page.confidence >= 15:
        score += 15.0  # some cert-like content

    return score >= 50.0, score


# ---------------------------------------------------------------------------
# Step 6: Versioning
# ---------------------------------------------------------------------------
def get_next_version(matricule: str, uploads_dir: Path) -> int:
    existing = list(uploads_dir.glob(f"hab{matricule}_v*.pdf"))
    if not existing:
        return 1
    versions = []
    for f in existing:
        m = re.search(r'_v(\d+)\.pdf$', f.name)
        if m:
            versions.append(int(m.group(1)))
    return max(versions) + 1 if versions else 1


# ---------------------------------------------------------------------------
# Step 7: PDF generation
# ---------------------------------------------------------------------------
def extract_page(src_pdf: str, page_num: int, out_path: str) -> bool:
    r = subprocess.run(
        ["pdfseparate", "-f", str(page_num), "-l", str(page_num), src_pdf, out_path],
        capture_output=True
    )
    return r.returncode == 0 and os.path.exists(out_path)


def merge_pages(page_paths: list[str], out_path: str) -> bool:
    if len(page_paths) == 1:
        shutil.copy2(page_paths[0], out_path)
        return True
    r = subprocess.run(["pdfunite"] + page_paths + [out_path], capture_output=True)
    return r.returncode == 0 and os.path.exists(out_path)


def get_page_count(pdf_path: str) -> int:
    r = subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True)
    m = re.search(r"Pages:\s+(\d+)", r.stdout)
    return int(m.group(1)) if m else 0


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def run_pipeline(raw_dir: Path, uploads_dir: Path) -> dict:
    uploads_dir.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(raw_dir.glob("*.pdf"))

    if not pdfs:
        print(f"No PDFs found in {raw_dir}", file=sys.stderr)
        sys.exit(1)

    # Per-file, per-page results
    all_pages: list[PageInfo] = []
    certificates: list[Certificate] = []
    review_queue: list[ReviewItem] = []
    seen_matricules: set[str] = set()

    total_pages = 0
    ocr_failures = 0

    with tempfile.TemporaryDirectory() as tmpdir:
        for pdf_path in pdfs:
            pdf_name = pdf_path.name
            n_pages = get_page_count(str(pdf_path))
            if n_pages == 0:
                print(f"SKIP (cannot read): {pdf_name}")
                continue

            print(f"\n{'='*60}")
            print(f"{pdf_name} ({n_pages} pages)")

            file_pages: list[PageInfo] = []

            # ── Step 1: OCR every page ──────────────────────────────────
            for page_num in range(1, n_pages + 1):
                total_pages += 1
                ppm_base = os.path.join(tmpdir, f"p{page_num:04d}")

                subprocess.run(
                    ["pdftoppm", "-r", "250", "-f", str(page_num), "-l", str(page_num),
                     str(pdf_path), ppm_base],
                    capture_output=True
                )
                ppm_candidates = sorted(Path(tmpdir).glob(f"p{page_num:04d}*.ppm"))
                if not ppm_candidates:
                    ocr_failures += 1
                    page = PageInfo(pdf_file=pdf_name, page_num=page_num)
                    page.review_reasons = ["render_failed"]
                    file_pages.append(page)
                    continue

                ppm_file = str(ppm_candidates[0])
                text = ocr_page_enhanced(ppm_file, tmpdir)
                os.unlink(ppm_file)

                page = PageInfo(pdf_file=pdf_name, page_num=page_num)
                page.char_count = len(text.strip())
                page.text_excerpt = text[:1000]  # store excerpt for review
                # Store full text on object for back-page detection
                page._full_text = text  # type: ignore[attr-defined]

                # ── Step 2: Classify ────────────────────────────────────
                if page.char_count < MIN_PHOTO_CHARS:
                    page.is_photo = True
                    print(f"  p{page_num}: PHOTO/UNREADABLE ({page.char_count} chars)")
                    file_pages.append(page)
                    continue

                score, anti_reasons = classify_page(text)
                page.confidence = score
                page.review_reasons = anti_reasons

                if score >= CERT_CONFIDENCE_THRESHOLD:
                    page.is_habilitation = True
                elif score >= UNCERTAIN_THRESHOLD:
                    # Uncertain — check for matricule anyway
                    page.is_habilitation = True
                    page.review_reasons.append(f"uncertain_confidence:{score:.0f}")

                # ── Step 3: Extract matricule ───────────────────────────
                if page.is_habilitation:
                    mat, mat_raw, candidates = extract_matricule(text)
                    page.matricule = mat
                    page.matricule_raw = mat_raw
                    page.candidate_matricules = candidates

                file_pages.append(page)
                all_pages.append(page)

            # ── Step 4: Front/back detection within this file ───────────
            i = 0
            while i < len(file_pages):
                page = file_pages[i]

                if not page.is_habilitation:
                    i += 1
                    continue

                # This page is a cert — collect its pages
                cert_pages = [{"file": pdf_name, "page": page.page_num}]

                # Peek at next page for possible back (AVIS or general back page)
                if i + 1 < len(file_pages):
                    nxt = file_pages[i + 1]
                    if not nxt.is_habilitation and not nxt.is_photo:
                        # AVIS page is always the back of the preceding cert
                        is_avis = "avis_back_page" in nxt.review_reasons
                        is_back, _ = detect_back_page(page, nxt)
                        if is_avis or is_back:
                            cert_pages.append({"file": pdf_name, "page": nxt.page_num})
                            i += 1  # consume back page

                # Decide on matricule
                mat = page.matricule
                mat_raw = page.matricule_raw or ""
                review_reasons = list(page.review_reasons)

                if not mat:
                    reason = "Certificate detected but no matricule found"
                    review_queue.append(ReviewItem(
                        review_type="no_matricule",
                        pdf_file=pdf_name,
                        page_num=page.page_num,
                        reason=reason,
                        confidence=page.confidence,
                        text_excerpt=page.text_excerpt[:500],
                    ))
                    label = f"NO_MAT(conf={page.confidence:.0f})"
                    print(f"  p{page.page_num}: CERT but NO MATRICULE (conf={page.confidence:.0f})")
                    i += 1
                    continue

                if len(page.candidate_matricules) > 1:
                    review_queue.append(ReviewItem(
                        review_type="multiple_matricules",
                        pdf_file=pdf_name,
                        page_num=page.page_num,
                        reason=f"Multiple candidates: {page.candidate_matricules}",
                        confidence=page.confidence,
                        matricule=mat,
                        text_excerpt=page.text_excerpt[:500],
                    ))

                if "uncertain_confidence" in " ".join(review_reasons):
                    review_queue.append(ReviewItem(
                        review_type="uncertain",
                        pdf_file=pdf_name,
                        page_num=page.page_num,
                        reason=f"Low confidence score: {page.confidence:.0f}",
                        confidence=page.confidence,
                        matricule=mat,
                        text_excerpt=page.text_excerpt[:500],
                    ))

                # Duplicate check
                if mat in seen_matricules:
                    print(f"  p{page.page_num}: DUPLICATE mat={mat}")
                    i += 1
                    continue

                # ── Steps 6-7: Version + generate PDF ───────────────────
                version = get_next_version(mat, uploads_dir)
                out_filename = f"hab{mat}_v{version}.pdf"
                out_path = uploads_dir / out_filename

                # Extract and merge pages
                page_pdfs = []
                ok = True
                for cp in cert_pages:
                    tmp_pdf = os.path.join(tmpdir, f"cert_{mat}_p{cp['page']}.pdf")
                    # Find actual pdf_path for this file
                    src = str(raw_dir / cp["file"])
                    if not extract_page(src, cp["page"], tmp_pdf):
                        ok = False
                        break
                    page_pdfs.append(tmp_pdf)

                if ok and page_pdfs:
                    if merge_pages(page_pdfs, str(out_path)):
                        seen_matricules.add(mat)
                        cert = Certificate(
                            matricule=mat,
                            matricule_raw=mat_raw,
                            pages=cert_pages,
                            page_count=len(cert_pages),
                            output_file=out_filename,
                            version=version,
                        )
                        certificates.append(cert)
                        sides = f"({len(cert_pages)}p)"
                        print(f"  p{page.page_num}: OK mat={mat} → {out_filename} {sides}")
                    else:
                        print(f"  p{page.page_num}: ERROR merging PDF for mat={mat}")
                        ocr_failures += 1
                else:
                    print(f"  p{page.page_num}: ERROR extracting page for mat={mat}")
                    ocr_failures += 1

                i += 1

    # ── Step 9: Report ──────────────────────────────────────────────────
    cert_pages_count = sum(c.page_count for c in certificates)
    one_page = sum(1 for c in certificates if c.page_count == 1)
    two_page = sum(1 for c in certificates if c.page_count == 2)
    multi_page = sum(1 for c in certificates if c.page_count > 2)

    habilitation_pages = sum(1 for p in all_pages if p.is_habilitation)
    non_hab_pages = sum(1 for p in all_pages if not p.is_habilitation and not p.is_photo)
    photo_pages = sum(1 for p in all_pages if p.is_photo)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "total_pages": total_pages,
            "habilitation_pages": habilitation_pages,
            "non_habilitation_pages": non_hab_pages,
            "photo_pages": photo_pages,
            "certificates_created": len(certificates),
            "one_page_certs": one_page,
            "two_page_certs": two_page,
            "multi_page_certs": multi_page,
            "ocr_failures": ocr_failures,
            "review_items": len(review_queue),
        },
        "certificates": [
            {
                "matricule": c.matricule,
                "matricule_raw": c.matricule_raw,
                "pages": c.pages,
                "page_count": c.page_count,
                "output_file": c.output_file,
                "version": c.version,
            }
            for c in certificates
        ],
        "review_queue": [
            {
                "type": r.review_type,
                "pdf_file": r.pdf_file,
                "page_num": r.page_num,
                "reason": r.reason,
                "confidence": r.confidence,
                "matricule": r.matricule,
                "text_excerpt": r.text_excerpt,
            }
            for r in review_queue
        ],
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    # Copy report to tracked reports/ dir (without full text excerpts to keep size down)
    slim_report = {k: v for k, v in report.items() if k != "review_queue"}
    slim_report["review_queue"] = [
        {k: v for k, v in r.items() if k != "text_excerpt"}
        for r in report["review_queue"]
    ]
    with open(REPORTS_DIR / "process-report.json", "w", encoding="utf-8") as f:
        json.dump(slim_report, f, ensure_ascii=False, indent=2)
    with open(REVIEW_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {"review_queue": [
                {k: v for k, v in r.items() if k != "text_excerpt"}
                for r in report["review_queue"]
            ]},
            f, ensure_ascii=False, indent=2
        )

    # ── Print summary ────────────────────────────────────────────────────
    s = report["stats"]
    print(f"\n{'='*60}")
    print(f"REPORT")
    print(f"{'='*60}")
    print(f"Total pages analyzed     : {s['total_pages']}")
    print(f"Habilitation pages       : {s['habilitation_pages']}")
    print(f"Non-habilitation pages   : {s['non_habilitation_pages']}")
    print(f"Photo/unreadable         : {s['photo_pages']}")
    print(f"Certificates created     : {s['certificates_created']}")
    print(f"  One-page               : {s['one_page_certs']}")
    print(f"  Two-page               : {s['two_page_certs']}")
    print(f"OCR failures             : {s['ocr_failures']}")
    print(f"Review queue items       : {s['review_items']}")
    print(f"\nReport written to       : {REPORT_PATH}")
    print(f"                        : {REPORTS_DIR / 'process-report.json'} (git-tracked)")
    print(f"Review queue written to : {REVIEW_PATH} (git-tracked)")

    if review_queue:
        print(f"\n{'─'*60}")
        print(f"REVIEW QUEUE ({len(review_queue)} items):")
        for r in review_queue:
            print(f"  [{r.review_type}] {r.pdf_file} p{r.page_num}: {r.reason}")

    return report


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process habilitation PDFs")
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--uploads-dir", type=Path, default=UPLOADS_DIR)
    args = parser.parse_args()

    RAW_DIR = args.raw_dir
    UPLOADS_DIR = args.uploads_dir
    REPORT_PATH = UPLOADS_DIR / "process-report.json"
    REPORTS_DIR = args.uploads_dir.parent.parent / "reports"
    REVIEW_PATH = REPORTS_DIR / "review-queue.json"

    run_pipeline(RAW_DIR, UPLOADS_DIR)
