"""Must + V2 path smoke tests — unified entry (V2 Multica replica)."""
from test_v2_paths import test_v2_paths


def test_must_paths():
    """V1 demo path checks are covered by V2 module tests."""
    test_v2_paths()


if __name__ == "__main__":
    test_must_paths()
