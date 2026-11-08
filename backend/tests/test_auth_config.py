import os
import unittest
from unittest.mock import patch

from app.auth import session_cookie_settings


class SessionCookieSettingsTests(unittest.TestCase):
    def test_secure_samesite_none_cookie_is_supported(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_COOKIE_SECURE": "true",
                "AUTH_COOKIE_SAMESITE": "none",
            },
        ):
            self.assertEqual(session_cookie_settings(), (True, "none"))

    def test_insecure_cross_site_cookie_is_rejected(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_COOKIE_SECURE": "false",
                "AUTH_COOKIE_SAMESITE": "none",
            },
        ):
            with self.assertRaises(RuntimeError):
                session_cookie_settings()


if __name__ == "__main__":
    unittest.main()
