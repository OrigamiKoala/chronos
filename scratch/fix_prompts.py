import re

# Fix src/services/gemini.js
with open('/Users/carlliu/stress-sandbox/src/services/gemini.js', 'r') as f:
    lines = f.readlines()

# The chemistry prompt for single-problem generator is at lines 85-99 (0-indexed 84-98)
# We need to keep lines 85-91 (the if/subjectContext/calibrate block) and replace 92-99
# Lines are 0-indexed in the list

new_chem_line = '    For Chemistry questions, represent ALL molecular structures (organic AND inorganic) strictly using SMILES notation so they render as structural diagrams. Use bracket notation for inorganic species with explicit hydrogens or charges (e.g., [OH2] for water, [NH3] for ammonia, [OH-] for hydroxide, [NH4+] for ammonium, OS(=O)(=O)O for sulfuric acid, [Na+].[Cl-] for NaCl, CC(=O)O for acetic acid). Do NOT use introductory phrases like "represented by the SMILES string..."; display the SMILES directly inline. For chemical reactions (organic or inorganic), represent strictly using Reaction SMILES syntax in the form Reactants>Reagents>Products or Reactants>>Products (e.g., C(C)O.CC(=O)O>[H+]>CC(=O)OCC.O for esterification). Use LaTeX ONLY for mathematical equations, equilibrium expressions, physical units, and variables (e.g., $\\\\Delta G^\\\\circ$, $E^\\\\circ$, $K_{\\\\text{sp}}$) \\u2014 never for molecular structures.\n'

# Replace lines 91 (0-indexed) through 98 (0-indexed) with new content
# Line 91 (0-idx) = line 92 (1-idx) - the old mangled chemistry instruction
# We want to keep through line 91 (the "- 10: hardest..." line, 0-idx 90)
# Then insert new chem line + closing
new_lines = lines[:91]  # lines 1-91 (0-idx 0-90)
new_lines.append(new_chem_line)
new_lines.append('    `;\n')
new_lines.append('    }\n')
# Skip old lines 92-99 (0-idx 91-98), resume from line 100 (0-idx 99)
# But we need to find where the next block starts
# Looking at the file: line 100 (1-idx) is blank, line 101 is "const systemInstruction"
# In current mangled state: lines 92-99 are junk, line 100 is blank
new_lines.extend(lines[99:])  # from 0-idx 99 onward

with open('/Users/carlliu/stress-sandbox/src/services/gemini.js', 'w') as f:
    f.writelines(new_lines)

print(f"Fixed gemini.js: {len(lines)} -> {len(new_lines)} lines")

# Now fix the second occurrence (batch generator) in the same file
with open('/Users/carlliu/stress-sandbox/src/services/gemini.js', 'r') as f:
    content = f.read()

old_batch_chem = """For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid). Do NOT use introductory or verbose phrases like "represented by the SMILES string..." or "whose SMILES representation is...". Instead, display the SMILES directly and let it render the question inline. For organic chemical reactions, do NOT use LaTeX under any circumstances; instead, represent organic reactions strictly using Ketcher (by EPAM) / Reaction SMILES syntax notation in the form of Reactants>Reagents>Products or Reactants>>Products (e.g., C(C)O.CC(=O)O>[H+]>CC(=O)OCC.O for esterification). Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\\\text{H}_2\\\\text{SO}_4$, $\\\\text{Fe}^{3+}$)."""

new_batch_chem = """For Chemistry questions, represent ALL molecular structures (organic AND inorganic) strictly using SMILES notation so they render as structural diagrams. Use bracket notation for inorganic species with explicit hydrogens or charges (e.g., [OH2] for water, [NH3] for ammonia, [OH-] for hydroxide, [NH4+] for ammonium, OS(=O)(=O)O for sulfuric acid, [Na+].[Cl-] for NaCl, CC(=O)O for acetic acid). Do NOT use introductory phrases like "represented by the SMILES string..."; display the SMILES directly inline. For chemical reactions (organic or inorganic), represent strictly using Reaction SMILES syntax in the form Reactants>Reagents>Products or Reactants>>Products (e.g., C(C)O.CC(=O)O>[H+]>CC(=O)OCC.O for esterification). Use LaTeX ONLY for mathematical equations, equilibrium expressions, physical units, and variables (e.g., $\\\\Delta G^\\\\circ$, $E^\\\\circ$, $K_{\\\\text{sp}}$) \u2014 never for molecular structures."""

if old_batch_chem in content:
    content = content.replace(old_batch_chem, new_batch_chem)
    with open('/Users/carlliu/stress-sandbox/src/services/gemini.js', 'w') as f:
        f.write(content)
    print("Fixed batch chemistry prompt in gemini.js")
else:
    print("WARNING: Could not find batch chemistry prompt in gemini.js")

# Fix api/generate.js
with open('/Users/carlliu/stress-sandbox/api/generate.js', 'r') as f:
    content = f.read()

old_api_chem = """For Chemistry questions, represent organic molecules strictly using SMILES notation (e.g., C(C)O for ethanol, CC(=O)O for acetic acid). Do NOT use introductory or verbose phrases like "represented by the SMILES string..." or "whose SMILES representation is...". Instead, display the SMILES directly and let it render the question inline. For organic chemical reactions, do NOT use LaTeX under any circumstances; instead, represent organic reactions strictly using Ketcher (by EPAM) / Reaction SMILES syntax notation in the form of Reactants>Reagents>Products or Reactants>>Products (e.g., C(C)O.CC(=O)O>[H+]>CC(=O)OCC.O for esterification). Represent inorganic molecules, structures, and reaction equations strictly using LaTeX (e.g., $\\\\text{H}_2\\\\text{SO}_4$, $\\\\text{Fe}^{3+}$)."""

new_api_chem = """For Chemistry questions, represent ALL molecular structures (organic AND inorganic) strictly using SMILES notation so they render as structural diagrams. Use bracket notation for inorganic species with explicit hydrogens or charges (e.g., [OH2] for water, [NH3] for ammonia, [OH-] for hydroxide, [NH4+] for ammonium, OS(=O)(=O)O for sulfuric acid, [Na+].[Cl-] for NaCl, CC(=O)O for acetic acid). Do NOT use introductory phrases like "represented by the SMILES string..."; display the SMILES directly inline. For chemical reactions (organic or inorganic), represent strictly using Reaction SMILES syntax in the form Reactants>Reagents>Products or Reactants>>Products (e.g., C(C)O.CC(=O)O>[H+]>CC(=O)OCC.O for esterification). Use LaTeX ONLY for mathematical equations, equilibrium expressions, physical units, and variables (e.g., $\\\\Delta G^\\\\circ$, $E^\\\\circ$, $K_{\\\\text{sp}}$) \u2014 never for molecular structures."""

if old_api_chem in content:
    content = content.replace(old_api_chem, new_api_chem)
    with open('/Users/carlliu/stress-sandbox/api/generate.js', 'w') as f:
        f.write(content)
    print("Fixed chemistry prompt in api/generate.js")
else:
    print("WARNING: Could not find chemistry prompt in api/generate.js")
