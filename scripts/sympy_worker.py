"""Bounded JSON mathematics. Construct objects from an AST allowlist, never eval."""
import ast
import json
import re
import sys
import resource

resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
try:
    import sympy as sp
    from sympy.calculus.util import continuous_domain
except ImportError:
    print(json.dumps({"ok": False, "error": "此 Python 未安装 SymPy，请使用已安装 SymPy 的解释器。"}, ensure_ascii=False))
    sys.exit(0)

FUNCTIONS = {name: getattr(sp, name) for name in
             ('sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'exp', 'log', 'Abs')}
FUNCTIONS['abs'] = sp.Abs
CONSTANTS = {'pi': sp.pi, 'e': sp.E, 'E': sp.E, 'I': sp.I, 'oo': sp.oo}
ASSUMPTIONS = {'real', 'positive', 'integer', 'complex'}


class Grammar:
    def __init__(self, data):
        self.domain = data.get('domain', 'real')
        if self.domain not in ('real', 'complex'):
            raise ValueError('domain 只支持 real 或 complex。')
        self.variable = data.get('variable', 'x')
        self.validate_name(self.variable)
        declarations = data.get('symbols', [])
        if not isinstance(declarations, list) or len(declarations) > 8:
            raise ValueError('最多声明 8 个符号。')
        self.symbols = {}
        for declaration in declarations:
            if not isinstance(declaration, dict):
                raise ValueError('符号声明格式无效。')
            name = declaration.get('name')
            self.validate_name(name)
            assumption = declaration.get('assumption', self.domain)
            if assumption not in ASSUMPTIONS or name in self.symbols:
                raise ValueError('符号假设无效或重复声明。')
            self.symbols[name] = sp.Symbol(name, **{assumption: True})
        if self.variable not in self.symbols:
            self.symbols[self.variable] = sp.Symbol(self.variable, **{self.domain: True})
        self.var = self.symbols[self.variable]
        self.nodes = 0
        self.denominators = []
        self.sources = []
        self.constraints = []

    def constrain(self, condition):
        if condition is not sp.S.true:
            value = str(condition)
            if value not in self.constraints:
                self.constraints.append(value)

    @staticmethod
    def validate_name(name):
        if not isinstance(name, str) or not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{0,15}', name) or name in CONSTANTS or name in FUNCTIONS:
            raise ValueError('变量名须为普通字母开头，且不能覆盖常量或函数。')

    def parse(self, source):
        if not isinstance(source, str) or not source.strip() or len(source) > 300:
            raise ValueError('每个表达式须为 1–300 个字符。')
        source = source.strip().replace('^', '**')
        try:
            tree = ast.parse(source, mode='eval')
        except SyntaxError:
            raise ValueError('表达式格式无效；乘法使用 *，等号两侧分别放 expression 和 rhs。') from None
        value = self.build(tree.body, source, 0)
        self.sources.append(value)
        return value

    def build(self, node, source, depth):
        self.nodes += 1
        if self.nodes > 500 or depth > 24:
            raise ValueError('表达式过于复杂。')
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            literal = ast.get_source_segment(source, node)
            if not re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', literal) or len(literal) > 60:
                raise ValueError('只支持普通十进制数值。')
            if 'e' in literal.lower() and abs(int(literal.lower().split('e')[1])) > 100:
                raise ValueError('数值指数超出限制。')
            return sp.Rational(literal)
        if isinstance(node, ast.Name):
            if node.id in CONSTANTS:
                return CONSTANTS[node.id]
            if node.id in self.symbols:
                return self.symbols[node.id]
            raise ValueError('表达式含未声明的符号；请通过 symbols 显式声明。')
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = self.build(node.operand, source, depth + 1)
            return value if isinstance(node.op, ast.UAdd) else sp.Mul(-1, value, evaluate=False)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            left = self.build(node.left, source, depth + 1)
            right = self.build(node.right, source, depth + 1)
            if isinstance(node.op, ast.Add):
                return sp.Add(left, right, evaluate=False)
            if isinstance(node.op, ast.Sub):
                return sp.Add(left, sp.Mul(-1, right, evaluate=False), evaluate=False)
            if isinstance(node.op, ast.Mult):
                return sp.Mul(left, right, evaluate=False)
            if isinstance(node.op, ast.Div):
                if right.is_zero is True:
                    raise ValueError('表达式包含恒为零的分母。')
                self.denominators.append(right)
                self.constrain(sp.Ne(right, 0))
                return sp.Mul(left, sp.Pow(right, -1, evaluate=False), evaluate=False)
            if right.is_number:
                if right.is_finite is not True or abs(right) > 100:
                    raise ValueError('幂指数须在 -100 到 100 之间。')
            if right.is_negative:
                self.denominators.append(left)
                self.constrain(sp.Ne(left, 0))
            return sp.Pow(left, right, evaluate=False)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCTIONS and not node.keywords and len(node.args) == 1:
            value = self.build(node.args[0], source, depth + 1)
            if node.func.id == 'log':
                self.constrain(sp.Gt(value, 0) if self.domain == 'real' else sp.Ne(value, 0))
            if self.domain == 'real' and node.func.id == 'sqrt':
                self.constrain(sp.Ge(value, 0))
            if self.domain == 'real' and node.func.id in ('asin', 'acos'):
                self.constrain(sp.And(sp.Ge(value, -1), sp.Le(value, 1)))
            if node.func.id == 'tan':
                self.constrain(sp.Ne(sp.cos(value), 0))
            return FUNCTIONS[node.func.id](value, evaluate=False)
        raise ValueError('只支持四则运算、幂、已声明变量及白名单数学函数；不接受程序代码。')

    def defined_domain(self, expressions):
        domain = sp.S.Reals if self.domain == 'real' else sp.S.Complexes
        known = True
        if self.domain == 'real':
            for expr in expressions:
                try:
                    domain = domain.intersect(continuous_domain(expr, self.var, sp.S.Reals))
                except (NotImplementedError, ValueError):
                    known = False
        for denominator in self.denominators:
            if denominator.free_symbols and self.var not in denominator.free_symbols:
                # This is a constraint on another parameter, not an equation in x.
                continue
            zeros = sp.solveset(denominator, self.var, domain=domain)
            if zeros.has(sp.ConditionSet):
                known = False
            domain = sp.Complement(domain, zeros)
        # Declared assumptions constrain the target variable as well as simplification.
        if self.var.is_positive:
            domain = domain.intersect(sp.Interval.open(0, sp.oo))
        if self.var.is_integer:
            domain = domain.intersect(sp.S.Integers)
        return domain, known


def result_fields(value):
    return {'result': str(value), 'latex': sp.latex(value)}


def compare(left, right, grammar):
    difference = sp.simplify(left - right)
    domain, known = grammar.defined_domain(grammar.sources)
    fields = {**result_fields(difference), 'domain': str(domain), 'constraints': grammar.constraints}
    if domain is sp.S.EmptySet:
        return {**fields, 'status': 'INCONCLUSIVE', 'completed': False, 'note': '没有共同定义域，不能据此验证等价。'}
    if difference == 0 and known:
        return {**fields, 'status': 'PASS', 'completed': True, 'note': '在所列共同定义域及声明假设下，符号差恒为零；原式排除值仍须保留。'}
    # Exact counterexamples can refute an identity; finite sampling cannot prove it.
    for sample in (-2, -1, 0, 1, 2):
        substitutions = {symbol: sp.Integer(sample if not symbol.is_positive else abs(sample) + 1) for symbol in grammar.symbols.values()}
        if domain.contains(substitutions[grammar.var]) is not sp.S.true:
            continue
        a, b = sp.simplify(left.subs(substitutions)), sp.simplify(right.subs(substitutions))
        if a.has(sp.nan, sp.zoo, sp.oo, -sp.oo) or b.has(sp.nan, sp.zoo, sp.oo, -sp.oo):
            continue
        delta = sp.simplify(a - b)
        if delta.is_zero is False and delta.is_finite is True:
            return {**fields, 'status': 'FAIL', 'completed': True, 'witness': {str(k): str(v) for k, v in substitutions.items()}, 'note': f'找到精确反例：左侧={a}，右侧={b}。'}
    return {**fields, 'status': 'INCONCLUSIVE', 'completed': False, 'note': '未化简为恒等的零，也未找到有效精确反例；不能视为通过。'}


def run(data):
    grammar = Grammar(data)
    operation = data.get('operation')
    check = {'engine': 'sympy', 'version': sp.__version__, 'operation': operation,
             'expression': data.get('expression', ''), 'status': 'COMPUTED', 'completed': True,
             'accuracy': 'exact', 'assumptions': {name: str(symbol.assumptions0) for name, symbol in grammar.symbols.items()}}
    for field in ('rhs', 'candidate', 'variable', 'domain', 'lower', 'upper', 'point', 'direction', 'matrix', 'matrixOperation', 'symbols'):
        if field in data:
            check[field] = data[field]
    if operation == 'matrix':
        rows = data.get('matrix')
        if not isinstance(rows, list) or not 1 <= len(rows) <= 5 or any(not isinstance(row, list) for row in rows):
            raise ValueError('matrix 须为最多 5×5 的矩形字符串数组。')
        if not 1 <= len(rows[0]) <= 5 or any(len(row) != len(rows[0]) for row in rows):
            raise ValueError('矩阵各行长度必须相同。')
        matrix = sp.Matrix([[grammar.parse(entry) for entry in row] for row in rows])
        if any(sp.simplify(entry).is_finite is False or sp.simplify(entry).has(sp.nan, sp.zoo) for entry in matrix):
            raise ValueError('矩阵条目不能是未定义值或无穷。')
        matrix_operation = data.get('matrixOperation', 'determinant')
        if matrix_operation == 'determinant':
            value = matrix.det()
        elif matrix_operation == 'inverse':
            grammar.constrain(sp.Ne(matrix.det(), 0))
            value = matrix.inv()
        elif matrix_operation == 'rank':
            value = sp.Integer(matrix.rank())
            if matrix.free_symbols:
                check.update(status='INCONCLUSIVE', completed=False)
        else:
            raise ValueError('矩阵运算只支持 determinant、inverse、rank。')
        return {**check, **result_fields(value), 'constraints': grammar.constraints, 'note': '按精确矩阵运算计算；含参矩阵的参数特殊值与可逆条件须另行检查。'}
    expression = grammar.parse(data.get('expression'))
    if operation not in ('solve', 'equivalent', 'antiderivative'):
        domain, known = grammar.defined_domain([expression])
        check['domain'] = str(domain)
        check['domainResolved'] = known
    if operation == 'solve':
        rhs = grammar.parse(data.get('rhs', '0'))
        domain, known = grammar.defined_domain([expression, rhs])
        equation = sp.Add(expression, sp.Mul(-1, rhs, evaluate=False), evaluate=False)
        value = sp.solveset(equation, grammar.var, domain=domain)
        completed = known and not value.has(sp.ConditionSet) and not equation.free_symbols.difference({grammar.var})
        check.update(domain=str(domain), status='COMPUTED' if completed else 'INCONCLUSIVE', completed=completed)
        check['note'] = '完整解集（已保留原式定义域）；EmptySet 表示无解。' if completed else '求解条件或含参分类尚未消除，不能声称已求出全部解或无解。'
        if isinstance(value, sp.FiniteSet):
            substitutions = []
            for root in value:
                residual = sp.simplify(equation.subs(grammar.var, root))
                substitutions.append({'value': str(root), 'residual': str(residual), 'status': 'PASS' if residual == 0 else 'INCONCLUSIVE'})
            check['substitutions'] = substitutions
            if any(item['status'] != 'PASS' for item in substitutions):
                check.update(status='INCONCLUSIVE', completed=False, note='候选解代入原式后未全部确认。')
    elif operation == 'differentiate':
        value = sp.diff(expression, grammar.var)
        check['note'] = '导数的符号计算结果；适用区间须结合原式定义域。'
    elif operation == 'integrate':
        value = sp.integrate(expression, grammar.var)
        check['note'] = '原函数的符号计算结果；不定积分须另加常数 C，可用 antiderivative 验证。'
    elif operation == 'definite_integral':
        lower, upper = grammar.parse(data.get('lower')), grammar.parse(data.get('upper'))
        if lower.free_symbols or upper.free_symbols:
            raise ValueError('积分边界须为不含变量的精确常数（可使用 oo）。')
        value = sp.integrate(expression, (grammar.var, lower, upper))
        check['note'] = '定积分的符号计算结果；无穷或奇点积分须说明收敛条件。'
    elif operation == 'limit':
        point = grammar.parse(data.get('point'))
        if point.free_symbols:
            raise ValueError('极限目标点须为不含变量的常数。')
        direction = data.get('direction', 'both')
        if direction not in ('both', '+', '-'):
            raise ValueError('极限方向只支持 both、+、-。')
        if direction == 'both' and point not in (sp.oo, -sp.oo):
            left = sp.limit(expression, grammar.var, point, dir='-')
            right = sp.limit(expression, grammar.var, point, dir='+')
            if left != right and sp.simplify(left - right) != 0:
                if left.has(sp.Limit, sp.AccumBounds) or right.has(sp.Limit, sp.AccumBounds):
                    return {**check, 'status': 'INCONCLUSIVE', 'completed': False, 'result': f'左={left}，右={right}', 'note': '单侧极限未全部求出，无法确认双侧极限。'}
                return {**check, 'result': '双侧极限不存在', 'left': str(left), 'right': str(right), 'note': '分别计算左右极限，结果不相同。'}
            value = left
        else:
            value = sp.limit(expression, grammar.var, point, dir='+' if direction == 'both' else direction)
        check['note'] = '已按所列方向计算极限；both 在有限点分别检查左右极限。'
    elif operation in ('equivalent', 'antiderivative'):
        candidate = grammar.parse(data.get('candidate'))
        left = sp.diff(candidate, grammar.var) if operation == 'antiderivative' else expression
        right = expression if operation == 'antiderivative' else candidate
        return {**check, **compare(left, right, grammar)}
    else:
        raise ValueError('不支持的符号运算。')
    if value.has(sp.Integral, sp.Derivative, sp.Limit, sp.ConditionSet, sp.AccumBounds) or value.has(sp.nan, sp.zoo):
        check.update(status='INCONCLUSIVE', completed=False, note='SymPy 返回未求出的运算或未定义值；尚未完成计算。')
    return {**check, **result_fields(value), 'constraints': grammar.constraints}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(16001)
        if len(raw) > 16000:
            raise ValueError('符号运算输入过大。')
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError('输入须为 JSON 对象。')
        print(json.dumps({'ok': True, 'check': run(data)}, ensure_ascii=False))
    except (ValueError, TypeError, KeyError, SyntaxError, NotImplementedError, sp.matrices.exceptions.NonInvertibleMatrixError, sp.matrices.exceptions.NonSquareMatrixError) as error:
        message = str(error) if isinstance(error, ValueError) else '此表达式或矩阵无法完成所选运算，请检查格式和条件。'
        print(json.dumps({'ok': False, 'error': message}, ensure_ascii=False))
    except Exception:
        print(json.dumps({'ok': False, 'error': '此表达式尚无法完成符号计算，请核对定义域或缩小问题。'}, ensure_ascii=False))
