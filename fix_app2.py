import sys

with open('src/App.tsx', 'r') as f:
    text = f.read()

# The original file starts at the first '* @license' after the nav
idx = text.rfind(' * SPDX-License-Identifier: Apache-2.0')
# The actual start of the second copy is `* @license\n * SPDX...`
# Let's find `/**\n * @license`
idx = text.rfind('/**\n * @license')
if idx == -1:
    idx = text.rfind('/* @license')
if idx == -1:
    idx = text.find('* @license', len(text)//2) - 3 # approx
    
print("Found original at", idx)

original = '/**\n ' + text[idx+3:]

with open('src/App.tsx.backup', 'w') as f:
    f.write(original)

