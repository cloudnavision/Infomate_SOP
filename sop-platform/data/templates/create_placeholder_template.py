"""
One-time script: generates a minimal sop_template.docx with docxtpl Jinja2 placeholders.
The TL can replace this with a branded version — no code changes needed.

Usage:
    pip install python-docx
    python data/templates/create_placeholder_template.py
"""
from pathlib import Path
from docx import Document
from docx.shared import Pt


def create():
    doc = Document()

    # Title
    doc.add_heading('{{ sop_title }}', level=1)

    # Cover metadata
    for label, var in [
        ('Client', '{{ client_name }}'),
        ('Process', '{{ process_name }}'),
        ('Meeting Date', '{{ meeting_date }}'),
        ('Generated', '{{ generated_date }}'),
        ('Total Steps', '{{ step_count }}'),
    ]:
        p = doc.add_paragraph()
        r = p.add_run(f'{label}: ')
        r.bold = True
        p.add_run(var)

    doc.add_page_break()

    # Sections (1–4, 6–14)
    doc.add_heading('Sections', level=2)
    doc.add_paragraph('{%- for section in sections %}')
    doc.add_heading('{{ section.section_title }}', level=3)
    doc.add_paragraph('{{ section.content_text | default("") }}')
    doc.add_paragraph('{%- endfor %}')

    doc.add_page_break()

    # Detailed procedure (Section 5)
    doc.add_heading('Detailed Procedure', level=2)
    doc.add_paragraph('{%- for step in steps %}')
    doc.add_heading('{{ step.sequence }}. {{ step.title }}', level=3)
    doc.add_paragraph('{{ step.description | default("") }}')
    doc.add_paragraph(
        '{%- for sub in step.sub_steps %}\n'
        '\u2022 {{ sub }}\n'
        '{%- endfor %}'
    )
    doc.add_paragraph('{%- if step.screenshot %}{{ step.screenshot }}{%- endif %}')
    doc.add_paragraph(
        '{%- for callout in step.callouts %}'
        '{{ callout.callout_number }}. {{ callout.label }}\n'
        '{%- endfor %}'
    )
    doc.add_paragraph('{%- endfor %}')

    out = Path(__file__).parent / 'sop_template.docx'
    doc.save(out)
    print(f'Template created: {out}')


if __name__ == '__main__':
    create()
