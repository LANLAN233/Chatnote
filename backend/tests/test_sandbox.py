"""Tests for PythonTools security sandbox (Phase 15)."""
from __future__ import annotations

import pytest

from app.ai.tools import create_safe_python_tools


# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────


@pytest.fixture
def sandbox():
    """Return a fresh sandboxed PythonTools instance for each test."""
    return create_safe_python_tools()


# ──────────────────────────────────────────────────────────────
# Test 1: Safe math and data-science modules work
# ──────────────────────────────────────────────────────────────


class TestSafeModulesWork:
    """Verify that allowed modules execute correctly."""

    def test_math_sqrt(self, sandbox):
        result = sandbox.run_python_code("result = math.sqrt(144)", variable_to_return="result")
        assert "12.0" in result

    def test_math_trig(self, sandbox):
        """sin(pi/2) should equal 1.0."""
        result = sandbox.run_python_code(
            "import math\nresult = math.sin(math.pi / 2)", variable_to_return="result"
        )
        assert "1.0" in result

    def test_json_dumps_loads(self, sandbox):
        result = sandbox.run_python_code(
            "import json\nresult = json.dumps({'key': 'value'})", variable_to_return="result"
        )
        assert '"key"' in result

    def test_datetime_now(self, sandbox):
        result = sandbox.run_python_code(
            "import datetime\nresult = datetime.datetime(2024, 1, 1).year",
            variable_to_return="result",
        )
        assert "2024" in result

    def test_collections_counter(self, sandbox):
        result = sandbox.run_python_code(
            "from collections import Counter\n"
            "c = Counter('abracadabra')\n"
            "result = c['a']",
            variable_to_return="result",
        )
        assert "5" in result

    def test_random_module(self, sandbox):
        result = sandbox.run_python_code(
            "import random\nresult = random.randint(1, 1)", variable_to_return="result"
        )
        assert "1" in result

    def test_statistics_mean(self, sandbox):
        result = sandbox.run_python_code(
            "import statistics\nresult = statistics.mean([1, 2, 3])", variable_to_return="result"
        )
        assert "2" in result or "2.0" in result


# ──────────────────────────────────────────────────────────────
# Test 2: Dangerous module imports are blocked
# ──────────────────────────────────────────────────────────────


class TestDangerousImportsBlocked:
    """Verify that dangerous modules raise ImportError."""

    def test_os_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import os")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_sys_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import sys")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_subprocess_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import subprocess")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_socket_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import socket")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_requests_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import requests")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_urllib_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import urllib")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_shutil_import_blocked(self, sandbox):
        result = sandbox.run_python_code("import shutil")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result


# ──────────────────────────────────────────────────────────────
# Test 3: File write via builtins.open is blocked
# ──────────────────────────────────────────────────────────────


class TestFileWriteBlocked:
    """Verify that ``builtins.open`` is not available in the sandbox."""

    def test_open_nameerror(self, sandbox):
        result = sandbox.run_python_code("f = open('test.txt', 'w')")
        assert "NameError" in result or "blocked" in result.lower() or "Error" in result

    def test_open_read_blocked(self, sandbox):
        result = sandbox.run_python_code('f = open("somefile.txt", "r")')
        assert "NameError" in result or "blocked" in result.lower() or "Error" in result

    def test_eval_blocked(self, sandbox):
        result = sandbox.run_python_code("result = eval('1+1')")
        assert "NameError" in result or "blocked" in result.lower() or "Error" in result

    def test_exec_blocked(self, sandbox):
        result = sandbox.run_python_code("exec('x = 1')")
        assert "NameError" in result or "blocked" in result.lower() or "Error" in result


# ──────────────────────────────────────────────────────────────
# Test 4: Execution timeout works
# ──────────────────────────────────────────────────────────────


class TestExecutionTimeout:
    """Verify that long-running code is killed by the timeout guard."""

    @pytest.fixture
    def fast_sandbox(self):
        """Sandbox with a 1-second timeout so tests complete quickly."""
        return create_safe_python_tools(execution_timeout=1)

    def test_infinite_loop_timeout(self, fast_sandbox):
        result = fast_sandbox.run_python_code("while True: pass")
        assert "timed out" in result or "TimeoutError" in result or "Error" in result

    def test_long_sleep_timeout(self, fast_sandbox):
        result = fast_sandbox.run_python_code("import time\ntime.sleep(10)")
        assert "timed out" in result or "TimeoutError" in result or "Error" in result


# ──────────────────────────────────────────────────────────────
# Test 5: Factory creates valid PythonTools instance
# ──────────────────────────────────────────────────────────────


class TestFactoryCreatesValidInstance:
    """Verify ``create_safe_python_tools()`` returns a functioning toolkit."""

    def test_has_run_python_code_method(self, sandbox):
        assert callable(getattr(sandbox, "run_python_code", None))

    def test_has_save_to_file_and_run_method(self, sandbox):
        assert callable(getattr(sandbox, "save_to_file_and_run", None))

    def test_pip_install_excluded(self, sandbox):
        """pip_install_package should not be in the registered tools list."""
        registered_names = {f.name for f in sandbox.functions.values()}
        assert "pip_install_package" not in registered_names
        assert "uv_pip_install_package" not in registered_names

    def test_base_dir_is_set(self, sandbox):
        assert sandbox.base_dir is not None
        assert sandbox.base_dir.exists()

    def test_run_python_code_returns_string(self, sandbox):
        result = sandbox.run_python_code("result = 42", variable_to_return="result")
        assert isinstance(result, str)
        assert "42" in result


# ──────────────────────────────────────────────────────────────
# Test 6: Unknown modules are blocked (allowlist enforcement)
# ──────────────────────────────────────────────────────────────


class TestUnknownModulesBlocked:
    """Modules not in the allowlist must be denied."""

    def test_tkinter_blocked(self, sandbox):
        result = sandbox.run_python_code("import tkinter")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result

    def test_django_blocked(self, sandbox):
        result = sandbox.run_python_code("import django")
        assert "ImportError" in result or "blocked" in result.lower() or "Error" in result
