"""Checks every breaks runner against the code as it stands, reading each table as data and never executing it: each text to
break must appear exactly once in its file, and each test pattern must name at least one test in its test files. A change
can move a text a break undoes, and a retitled test leaves a pattern that matches nothing, so its break has no green
baseline (2026-10-19: both happened, found before any runner ran).

python check_runners.py [runner.py ...]   (all of qa/*_breaks.py when none is named)
"""
import ast
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
TITLE = re.compile(r"""\b(?:it|test|describe)(?:\.\w+)?\(\s*(?:`([^`]*)`|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")
THEMES = ('nocturne', 'instrument', 'signal')


def titles(path):
    s = io.open(ROOT + path, encoding='utf-8').read()
    out = []
    for m in TITLE.finditer(s):
        t = m.group(1) or m.group(2) or m.group(3) or ''
        # A template's ${theme} stands for each theme's name.
        out += [t.replace('${theme}', th) for th in THEMES] if '${theme}' in t else [t]
    return out


def table_of(runner):
    tree = ast.parse(io.open(runner, encoding='utf-8').read())
    names = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                names[node.targets[0].id] = ast.literal_eval(node.value)
            except Exception:
                pass

    def value(n):
        if isinstance(n, ast.Name):
            return names[n.id]
        if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Add):
            return value(n.left) + value(n.right)
        if isinstance(n, ast.List):
            return [value(e) for e in n.elts]
        return ast.literal_eval(n)

    table = next((node.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TABLE' for t in node.targets)), None)
    assert isinstance(table, ast.List), f'{runner}: no TABLE list'
    return [{k.arg: value(k.value) for k in call.keywords} for call in table.elts]


def main(runners):
    bad = 0
    for runner in runners:
        rows = table_of(runner)
        problems = []
        for kw in rows:
            n = io.open(ROOT + kw['file'], encoding='utf-8', newline='').read().count(kw['old'])
            if n != 1:
                problems.append(f"{kw['id']}: its text appears {n} times in {kw['file']}")
            pat = kw.get('pattern')
            assert kw.get('tests'), f"{kw['id']}: an empty test list would run everything"
            if pat and not any(re.search(pat, t) for f in kw['tests'] for t in titles(f)):
                problems.append(f"{kw['id']}: /{pat}/ names no test in {', '.join(kw['tests'])}")
        bad += len(problems)
        print(f"{os.path.basename(runner)}: {len(rows)} entries, {len(problems)} to restate")
        for p in problems:
            print('   ', p)
    return bad


if __name__ == '__main__':
    runners = sys.argv[1:] or sorted(glob.glob(ROOT + 'qa/*_breaks.py'))
    sys.exit(1 if main(runners) else 0)
