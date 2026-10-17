"""Pair each snapshot written under a renamed describe with its obsolete predecessor and diff them.

python snappair.py <snap file> <old title> <new title> [--full]
"""
import difflib
import io
import re
import sys

path, old_title, new_title = sys.argv[1], sys.argv[2], sys.argv[3]
full = '--full' in sys.argv
text = io.open(path, encoding='utf-8').read()
entries = {}
for m in re.finditer(r'exports\[`(.*?)`\] = `(.*?)`;\n', text, re.S):
    entries[m.group(1)] = m.group(2)

pairs = 0
for key, new_value in entries.items():
    if not key.startswith(new_title):
        continue
    old_key = old_title + key[len(new_title):]
    if old_key not in entries:
        print('NO PREDECESSOR:', key)
        continue
    pairs += 1
    old_value = entries[old_key]
    if old_value == new_value:
        print('SAME:', key)
        continue
    diff = list(difflib.unified_diff(old_value.splitlines(), new_value.splitlines(), lineterm='', n=0))
    changed = [l for l in diff if (l.startswith('+') or l.startswith('-')) and not l.startswith('+++') and not l.startswith('---')]
    print(f'CHANGED: {key} ({len(changed)} lines)')
    for l in (changed if full else changed[:60]):
        print('   ', l[:400])
print('pairs', pairs)
