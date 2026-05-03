"""
Run all test suites. Exit with code 1 if any suite fails.
"""
import subprocess
import sys
import os

SUITES = [
    'test_1v1.py',
    'test_2v2.py',
    'test_rotation.py',
    'test_preview_accuracy.py',
    'test_competitive.py',
    'test_permanent_partners.py',
    'test_sit_out.py',
    'test_override.py',
]

failures = []
for suite in SUITES:
    print(f'\n{"─"*60}')
    print(f'  Running {suite}')
    print(f'{"─"*60}')
    result = subprocess.run(
        [sys.executable, suite],
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )
    if result.returncode != 0:
        failures.append(suite)

print(f'\n{"="*60}')
if failures:
    print(f'  FAILED: {len(failures)}/{len(SUITES)} suites')
    for f in failures:
        print(f'    ✗ {f}')
    sys.exit(1)
else:
    print(f'  ALL {len(SUITES)} SUITES PASSED ✓')
