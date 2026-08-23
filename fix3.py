with open('src/App.tsx.orig', 'r') as f:
    text = f.read()

text = text.replace('        </nav>* @license', '/**\n * @license')

with open('src/App.tsx', 'w') as f:
    f.write(text)
