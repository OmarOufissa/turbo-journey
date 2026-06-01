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
REPORT_PATH = UPLOADS_DIR / "process-report.json"
REVIEW_PATH = UPLOADS_DIR / "review-queue.json"

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


def classify_page(text: str) -> tuple[float, list[str]]:
    """
    Returns (confidence_score, review_reasons).
    confidence >= CERT_CONFIDENCE_THRESHOLD → habilitation cert.
    """
    text_lower = text.lower()
    score = 0.0
    reasons = []

    for pattern, weight in CERT_KEYWORDS:
        if re.search(pattern, text_lower):
            score += weight

    for pattern, weight in ANTI_KEYWORDS:
        if re.search(pattern, text_lower):
            score += weight  # weight is negative
            reasons.append(f"Anti-keyword matched: {pattern}")

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
    Searches each line and the line after (handles OCR line breaks).
    """
    lines = text.splitlines()
    candidates: dict[str, str] = {}  # normalized → raw

    for i, line in enumerate(lines):
        # Try patterns on current line
        for pattern in MATRICULE_PATTERNS:
            m = re.search(pattern, line, re.IGNORECASE)
            if m:
                raw = m.group(1).strip()
                normalized = normalize_raw(raw)
                if re.match(r'^\d{5}[A-Z]?$', normalized):
                    candidates[normalized] = raw

        # If a matricule pattern label is found but no number on this line,
        # look ahead up to 3 lines (handling OCR line breaks)
        if re.search(r'matricule\s*:?|matr?\s*:|mle\s*:', line, re.IGNORECASE):
            if not any(re.search(p, line, re.IGNORECASE) and re.search(r'\d{4,6}', line)
                       for p in MATRICULE_PATTERNS):
                for j in range(1, 4):
                    if i + j >= len(lines):
                        break
                    next_line = lines[i + j].strip()
                    if not next_line:
                        continue
                    m = re.search(r'\b([0-9OIl]{5}[A-Z]?)\b', next_line)
                    if m:
                        raw = m.group(1).strip()
                        normalized = normalize_raw(raw)
                        if re.match(r'^\d{5}[A-Z]?$', normalized):
                            candidates[normalized] = raw
                    break  # only look past blank lines

    if not candidates:
        return None, None, []
    if len(candidates) == 1:
        norm, raw = next(iter(candidates.items()))
        return norm, raw, [norm]

    # Multiple candidates — prefer the one near "Nom et Prénom" (employee section)
    # Find the line number of "Nom et Prénom" and pick the closest match
    nom_line = next((i for i, l in enumerate(lines)
                     if re.search(r"nom\s+et\s+pr.nom", l, re.IGNORECASE)), None)
    if nom_line is not None:
        for i, line in enumerate(lines):
            for pattern in MATRICULE_PATTERNS:
                m = re.search(pattern, line, re.IGNORECASE)
                if m:
                    raw = m.group(1).strip()
                    normalized = normalize_raw(raw)
                    if normalized in candidates and abs(i - nom_line) <= 3:
                        return normalized, raw, list(candidates.keys())

    # Fallback: first candidate
    norm, raw = next(iter(candidates.items()))
    return norm, raw, list(candidates.keys())


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

                # Peek at next page for possible back
                if i + 1 < len(file_pages):
                    nxt = file_pages[i + 1]
                    if not nxt.is_habilitation and not nxt.is_photo:
                        is_back, back_conf = detect_back_page(page, nxt)
                        if is_back:
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

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    with open(REVIEW_PATH, "w", encoding="utf-8") as f:
        json.dump({"review_queue": report["review_queue"]}, f, ensure_ascii=False, indent=2)

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
    print(f"Review queue written to : {REVIEW_PATH}")

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
    REVIEW_PATH = UPLOADS_DIR / "review-queue.json"

    run_pipeline(RAW_DIR, UPLOADS_DIR)
