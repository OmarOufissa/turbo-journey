#!/usr/bin/env python3
"""
OCR pipeline: extract one page per employee from batch habilitation PDFs.
Reads the matricule ONLY from the "Matricule :" label line near "Nom et Prénom :".
Outputs: server/seeds/pdfs/hab{matricule}_seed.pdf
"""

import os
import re
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path

RAW_DIR = Path(__file__).parent.parent / "raw-pdfs"
OUT_DIR = Path(__file__).parent.parent / "server" / "seeds" / "pdfs"

# Minimum character count to consider a page text-readable (not a photo-PDF)
MIN_TEXT_CHARS = 80

def ocr_page(ppm_path: str) -> str:
    """Run tesseract on a PPM image and return the extracted text."""
    result = subprocess.run(
        ["tesseract", ppm_path, "stdout", "-l", "fra"],
        capture_output=True, text=True
    )
    return result.stdout

def extract_matricule(text: str) -> str | None:
    """
    Extract the employee matricule ONLY from the line containing 'Matricule :'.
    The number can be on the same line or the very next line (OCR line-break artifact).
    Returns 5-digit string or None.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        # Match "Matricule" followed by optional colon/spaces on this line
        if re.search(r'[Mm]atricule\s*:?', line):
            # Try to find 5-digit number on the same line first
            m = re.search(r'\b(\d{5})\b', line)
            if m:
                return m.group(1)
            # Check the next line (OCR sometimes splits label from value)
            if i + 1 < len(lines):
                m = re.search(r'^\s*(\d{5})\b', lines[i + 1])
                if m:
                    return m.group(1)
    return None

def is_habilitation_certificate(text: str) -> bool:
    """Check if the page is a 'Titre d'habilitation' certificate."""
    return bool(re.search(r"titre\s+d.habilitation", text, re.IGNORECASE))

def extract_pdf_page(src_pdf: str, page_num: int, out_path: str) -> bool:
    """Extract a single page from a PDF (1-indexed) to out_path."""
    result = subprocess.run(
        ["pdfseparate", "-f", str(page_num), "-l", str(page_num), src_pdf, out_path],
        capture_output=True
    )
    return result.returncode == 0

def get_page_count(pdf_path: str) -> int:
    result = subprocess.run(
        ["pdfinfo", pdf_path],
        capture_output=True, text=True
    )
    m = re.search(r"Pages:\s+(\d+)", result.stdout)
    return int(m.group(1)) if m else 0

def process_all():
    pdfs = sorted(RAW_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {RAW_DIR}", file=sys.stderr)
        sys.exit(1)

    # Results tracking
    assigned: dict[str, tuple[str, int]] = {}  # matricule -> (pdf_name, page_num) first seen
    skipped_not_cert: list[tuple[str, int]] = []
    skipped_no_mat: list[tuple[str, int]] = []
    flagged_photo: list[tuple[str, int]] = []
    conflicts: list[tuple[str, int, str]] = []  # (pdf, page, matricule) duplicates

    total_pages = 0

    with tempfile.TemporaryDirectory() as tmpdir:
        for pdf_path in pdfs:
            pdf_name = pdf_path.name
            n_pages = get_page_count(str(pdf_path))
            print(f"\n{'='*60}")
            print(f"Processing: {pdf_name} ({n_pages} pages)")

            for page_num in range(1, n_pages + 1):
                total_pages += 1
                ppm_base = os.path.join(tmpdir, f"page_{page_num:04d}")
                ppm_out = ppm_base + ".ppm"

                # Render page to image at 200 DPI
                subprocess.run(
                    ["pdftoppm", "-r", "200", "-f", str(page_num), "-l", str(page_num),
                     str(pdf_path), ppm_base],
                    capture_output=True
                )

                # Find the actual PPM output (pdftoppm appends -NNN)
                ppm_candidates = list(Path(tmpdir).glob(f"page_{page_num:04d}*.ppm"))
                if not ppm_candidates:
                    print(f"  Page {page_num}: ERROR - could not render")
                    skipped_no_mat.append((pdf_name, page_num))
                    continue
                ppm_file = str(ppm_candidates[0])

                text = ocr_page(ppm_file)

                # Clean up the ppm file immediately to save disk
                os.unlink(ppm_file)

                # Check if it's a photo-PDF (very little text)
                text_len = len(text.strip())
                if text_len < MIN_TEXT_CHARS:
                    print(f"  Page {page_num}: PHOTO/UNREADABLE (only {text_len} chars)")
                    flagged_photo.append((pdf_name, page_num))
                    continue

                # Check if it's a habilitation certificate
                if not is_habilitation_certificate(text):
                    print(f"  Page {page_num}: SKIP (not a titre d'habilitation)")
                    skipped_not_cert.append((pdf_name, page_num))
                    continue

                # Extract matricule
                matricule = extract_matricule(text)
                if not matricule:
                    print(f"  Page {page_num}: NO MATRICULE FOUND in certificate")
                    skipped_no_mat.append((pdf_name, page_num))
                    continue

                # Check for duplicate
                if matricule in assigned:
                    prev_pdf, prev_page = assigned[matricule]
                    print(f"  Page {page_num}: DUPLICATE mat={matricule} (already from {prev_pdf} p{prev_page})")
                    conflicts.append((pdf_name, page_num, matricule))
                    continue

                # Extract this page as a single PDF
                out_pdf = OUT_DIR / f"hab{matricule}_seed.pdf"
                tmp_out = os.path.join(tmpdir, f"hab{matricule}_seed.pdf")
                ok = extract_pdf_page(str(pdf_path), page_num, tmp_out)
                if ok and os.path.exists(tmp_out):
                    shutil.copy2(tmp_out, str(out_pdf))
                    assigned[matricule] = (pdf_name, page_num)
                    print(f"  Page {page_num}: OK mat={matricule} -> hab{matricule}_seed.pdf")
                else:
                    print(f"  Page {page_num}: ERROR extracting page for mat={matricule}")

    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total pages processed : {total_pages}")
    print(f"Certificates matched  : {len(assigned)}")
    print(f"Duplicates (skipped)  : {len(conflicts)}")
    print(f"Not a certificate     : {len(skipped_not_cert)}")
    print(f"No matricule found    : {len(skipped_no_mat)}")
    print(f"Photo/unreadable      : {len(flagged_photo)}")

    if flagged_photo:
        print(f"\nFLAGGED as photo-PDF (needs manual review):")
        for f, p in flagged_photo:
            print(f"  {f} page {p}")

    if skipped_no_mat:
        print(f"\nNo matricule found in certificate:")
        for f, p in skipped_no_mat:
            print(f"  {f} page {p}")

    if conflicts:
        print(f"\nDuplicate matricules (kept first occurrence):")
        for f, p, m in conflicts:
            print(f"  mat={m} duplicate in {f} page {p}")

    print(f"\nOutput PDFs written to: {OUT_DIR}")
    print(f"Matricules assigned: {sorted(assigned.keys())}")

    return assigned

if __name__ == "__main__":
    # Clear existing (wrong) seed PDFs
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = list(OUT_DIR.glob("hab*_seed.pdf"))
    if existing:
        print(f"Removing {len(existing)} existing seed PDFs...")
        for f in existing:
            f.unlink()

    assigned = process_all()
    print(f"\nDone. {len(assigned)} employee PDFs written.")
