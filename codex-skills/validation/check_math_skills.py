#!/usr/bin/env python3
"""Exercise installed helpers with known results and independent SymPy checks."""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/codex-math-skills-mpl")

import mpmath
import sympy as sp


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skills-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    verifier = args.skills_root.resolve() / "math-skill/scripts/math_verify.py"
    results = []

    def cli(label, command, expected_status, expected_exit):
        run = subprocess.run(
            [sys.executable, str(verifier), "--json", *command],
            capture_output=True, text=True, timeout=30,
        )
        assert run.stdout.strip(), (label, run.returncode, run.stderr)
        payload = json.loads(run.stdout)
        assert run.returncode == expected_exit, (label, run.stdout, run.stderr)
        assert payload["status"] == expected_status, (label, payload)
        results.append({"label": label, "passed": True, "type": "helper", "command": command, "result": payload})
        print(f"[PASS] {label}")

    cli("三次方程全部根", ["solve", "x^3-6*x^2+11*x-6=0", "--var", "x", "--expected", "1", "--expected", "2", "--expected", "3"], "PASS", 0)
    cli("根式方程排除增根", ["solve", "sqrt(x+6)=x", "--var", "x", "--expected", "3"], "PASS", 0)
    cli("有理方程排除分母零点后无解", ["solve", "(x^2-1)/(x-1)=2", "--var", "x"], "PASS", 0)
    cli("分部积分并回代求导", ["antiderivative", "--var", "x", "--", "x*sin(x)", "-x*cos(x)+sin(x)"], "PASS", 0)
    cli("换元法广义积分", ["definite-integral", "x*exp(-x^2)", "0", "oo", "1/2", "--var", "x"], "PASS", 0)
    cli("双侧三角极限", ["limit", "sin(x)/x", "0", "1", "--var", "x"], "PASS", 0)
    cli("优化题导函数", ["derivative", "x*exp(-x)", "exp(-x)*(1-x)", "--var", "x"], "PASS", 0)
    cli("二元线性方程组回代", ["system", "--equation", "2*x+y=5", "--equation", "x-y=1", "--assignment", "x=2", "--assignment", "y=1"], "PASS", 0)

    cli("拒绝错导数", ["derivative", "x^2", "3*x", "--var", "x"], "FAIL", 1)
    cli("拒绝根式增根", ["solve", "sqrt(x+6)=x", "--var", "x", "--expected", "3", "--expected", "-2"], "FAIL", 1)
    cli("拒绝遗漏一个三次方程根", ["solve", "x^3-6*x^2+11*x-6=0", "--var", "x", "--expected", "1", "--expected", "2"], "FAIL", 1)
    cli("不能无条件把根号平方化成自身", ["equiv", "sqrt(x^2)", "x"], "FAIL", 1)
    cli("抽样支持不升级为不等式证明", ["satisfies", "x^2>=0", "--vars", "x"], "INCONCLUSIVE", 1)
    cli("局部反例搜索没有反例不代表证明", ["counterexample", "x^2>=0", "--var", "x", "--xmin", "-2", "--xmax", "2", "--points", "21"], "INCONCLUSIVE", 1)

    x, y = sp.symbols("x y", real=True)

    def symbolic(label, actual, expected):
        assert actual == expected, (label, actual, expected)
        results.append({"label": label, "passed": True, "type": "direct-sympy", "actual": str(actual), "expected": str(expected)})
        print(f"[PASS] {label}")

    # Different representations and methods corroborate the helper checks.
    polynomial = x**3 - 6*x**2 + 11*x - 6
    symbolic("多项式因式分解", sp.factor(polynomial), (x-1)*(x-2)*(x-3))
    symbolic("原方程残差", tuple(polynomial.subs(x, root) for root in (1, 2, 3)), (0, 0, 0))
    symbolic("实数符号下绝对值分支", sp.sqrt(x**2), sp.Abs(x))
    symbolic("不定积分由 CAS 独立求出", sp.integrate(x*sp.sin(x), x), -x*sp.cos(x)+sp.sin(x))
    symbolic("广义积分换元后的独立计算", sp.integrate(sp.exp(-y)/2, (y, 0, sp.oo)), sp.Rational(1, 2))
    f = x*sp.exp(-x)
    symbolic("优化题全部驻点", sp.solveset(sp.diff(f, x), x, domain=sp.Interval(0, sp.oo)), sp.FiniteSet(1))
    symbolic("优化题在驻点的值", f.subs(x, 1), sp.exp(-1))
    symbolic("优化题右边界极限", sp.limit(f, x, sp.oo), sp.S.Zero)
    symbolic("优化题导数正负范围", sp.solve_univariate_inequality(sp.diff(f, x)>0, x), x < 1)
    matrix = sp.Matrix([[2, 1], [1, -1]])
    target = sp.Matrix([5, 1])
    solution = matrix.inv()*target
    symbolic("矩阵求解与方程组一致", solution, sp.Matrix([2, 1]))
    symbolic("矩阵解回代", matrix*solution, target)
    symbolic("系数矩阵保证唯一解", matrix.det(), sp.Integer(-3))

    data = {
        "scope": "Actual helper execution and direct symbolic calculation; no independent-model benchmark or automatic skill-selection proof.",
        "skills_root": str(args.skills_root.resolve()),
        "environment": {"python": platform.python_version(), "executable": sys.executable, "sympy": sp.__version__, "mpmath": mpmath.__version__},
        "passed": len(results), "checks": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n")
    print(f"{len(results)} checks passed. Evidence: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
