import re
import os

with open('src/engine/simulation/core.ts', 'r') as f:
    content = f.read()

# We need to find the pipeline stages.
# But writing a reliable regex-based AST parser for TypeScript is hard.
