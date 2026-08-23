with open('src/App.tsx.orig', 'r') as f:
    text = f.read()
    if text.startswith('* @license'):
        text = '/**\n ' + text
        with open('src/App.tsx.orig', 'w') as out:
            out.write(text)
