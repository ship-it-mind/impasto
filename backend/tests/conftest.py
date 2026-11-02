"""Tests run against a throwaway database and with no model keys, so they can't touch real pieces or pay for a model call."""

import os
import tempfile
from pathlib import Path

folder = tempfile.mkdtemp(prefix="impasto-tests-")
os.environ["IMPASTO_DB"] = str(Path(folder) / "test.db")
os.environ["MODEL_API_KEY"] = ""
os.environ["FAL_KEY"] = ""
os.environ["IMPASTO_INVITE_CODE"] = "test-invite"
# No example from the repo: a test that wants one makes it.
os.environ["IMPASTO_EXAMPLE_PIECE"] = ""
os.environ["IMPASTO_EXAMPLE_DIR"] = str(Path(folder) / "example")
