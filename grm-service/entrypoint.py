"""Drop privileges after fixing ownership of the persistent SQLite volume.

Docker named volumes created by an older root-running GRM may be root-owned.
The container starts as root only for this one filesystem ownership repair, then
execs Uvicorn as the unprivileged app user for the actual service process.
"""

from __future__ import annotations

import os
import pwd
import sys
from pathlib import Path


DATA_DIR = Path(os.getenv("GRM_DATA_DIR", "/app/data"))
APP_USER = os.getenv("GRM_RUNTIME_USER", "app")


def drop_to_app_user() -> None:
    if os.geteuid() != 0:
        return
    account = pwd.getpwnam(APP_USER)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for path in (DATA_DIR, *DATA_DIR.rglob("*")):
        try:
            os.chown(path, account.pw_uid, account.pw_gid)
        except FileNotFoundError:
            pass
    os.setgroups([])
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)


def main() -> None:
    drop_to_app_user()
    os.execvp("uvicorn", ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"])


if __name__ == "__main__":
    main()
