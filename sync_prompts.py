import re

with open('api/generate.js', 'r') as f:
    api_content = f.read()

match = re.search(r'Generate Chemistry Olympiad problems at difficulty level.*?10: hardest problem on the IChO.\n`;', api_content, re.DOTALL)
if match:
    chem_prompt = match.group(0)
    
    with open('src/services/gemini.js', 'r') as f:
        gemini_content = f.read()
        
    gemini_content = re.sub(
        r'if \(normSubject === \'chemistry\'\) \{.*?\n    \} else if \(normSubject === \'math\'\)',
        f"if (normSubject === 'chemistry') {{\n        subjectContext = `\n{chem_prompt}\n        `;\n    }} else if (normSubject === 'math')",
        gemini_content,
        flags=re.DOTALL
    )
    
    with open('src/services/gemini.js', 'w') as f:
        f.write(gemini_content)
    
    print('Updated gemini.js with the latest api/generate.js chemistry prompt.')
else:
    print('Regex failed to match in api/generate.js')
