import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";
import "./PoliceAuthPage.css";

export default function PoliceAuthPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loginForm, setLoginForm] = useState({
    phone: "",
    password: "",
  });

  const [signupForm, setSignupForm] = useState({
    name: "",
    district: "Dhaka",
    thana: "",
    address: "",
    phone: "",
    password: "",
    confirmPassword: "",
    latitude: "",
    longitude: "",
  });

  const updateLogin = (field, value) => {
    setLoginForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateSignup = (field, value) => {
    setSignupForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/police/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          phone: loginForm.phone,
          password: loginForm.password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Login failed");
      }

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      if (signupForm.password !== signupForm.confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const body = {
        name: signupForm.name,
        district: signupForm.district,
        thana: signupForm.thana,
        address: signupForm.address,
        phone: signupForm.phone,
        password: signupForm.password,
      };

      if (signupForm.latitude && signupForm.longitude) {
        body.latitude = Number(signupForm.latitude);
        body.longitude = Number(signupForm.longitude);
      }

      const response = await fetch(`${API_URL}/police/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Registration failed");
      }

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="police-auth-page">
      <section className="police-auth-shell">
        <div className="portal-brand">
          <div className="brand-mark" />
          <h1>Nirvaya</h1>
          <p>POLICE PORTAL</p>
        </div>

        <div className="auth-tabs">
          <button
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Log in
          </button>

          <button
            className={mode === "signup" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Register station
          </button>
        </div>

        {mode === "login" ? (
          <form className="auth-card" onSubmit={handleLogin}>
            <div className="auth-note">
              Access restricted to <strong>registered police stations</strong>{" "}
              only.
            </div>

            <label>PHONE NUMBER</label>
            <input
              value={loginForm.phone}
              onChange={(e) => updateLogin("phone", e.target.value)}
              placeholder="01XXXXXXXXX"
            />

            <label>PASSWORD</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) => updateLogin("password", e.target.value)}
              placeholder="Enter password"
            />

            <button
              type="button"
              className="forgot-button"
              onClick={() => alert("Forgot password can be added later.")}
            >
              Forgot password?
            </button>

            {error && <p className="auth-error">{error}</p>}

            <button className="submit-button" disabled={loading}>
              {loading ? "Logging in..." : "Log in to dashboard"}
            </button>
          </form>
        ) : (
          <form className="auth-card signup-card" onSubmit={handleSignup}>
            <div className="auth-note">
              Register your station to receive{" "}
              <strong>SOS alerts and incident reports</strong> from the Nirvaya
              app.
            </div>

            <label>STATION NAME</label>
            <input
              value={signupForm.name}
              onChange={(e) => updateSignup("name", e.target.value)}
              placeholder="e.g. Bhatara Police Station"
            />

            <div className="form-grid">
              <div>
                <label>DISTRICT</label>
                <input
                  value={signupForm.district}
                  onChange={(e) => updateSignup("district", e.target.value)}
                  placeholder="Dhaka"
                />
              </div>

              <div>
                <label>THANA</label>
                <input
                  value={signupForm.thana}
                  onChange={(e) => updateSignup("thana", e.target.value)}
                  placeholder="e.g. Bhatara"
                />
              </div>
            </div>

            <label>FULL ADDRESS</label>
            <input
              value={signupForm.address}
              onChange={(e) => updateSignup("address", e.target.value)}
              placeholder="Street, area, city"
            />

            <div className="section-divider">
              <span>CONTACT & ACCESS</span>
            </div>

            <label>STATION PHONE</label>
            <input
              value={signupForm.phone}
              onChange={(e) => updateSignup("phone", e.target.value)}
              placeholder="01XXXXXXXXX"
            />

            <div className="form-grid">
              <div>
                <label>PASSWORD</label>
                <input
                  type="password"
                  value={signupForm.password}
                  onChange={(e) => updateSignup("password", e.target.value)}
                  placeholder="Min 6 chars"
                />
              </div>

              <div>
                <label>CONFIRM</label>
                <input
                  type="password"
                  value={signupForm.confirmPassword}
                  onChange={(e) =>
                    updateSignup("confirmPassword", e.target.value)
                  }
                  placeholder="Repeat"
                />
              </div>
            </div>

            <div className="section-divider">
              <span>LOCATION</span>
            </div>

            <p className="location-help">
              Leave latitude/longitude empty to let backend find location using
              ORS. If ORS fails, enter them manually.
            </p>

            <div className="form-grid">
              <div>
                <label>LATITUDE</label>
                <input
                  value={signupForm.latitude}
                  onChange={(e) => updateSignup("latitude", e.target.value)}
                  placeholder="23.8159"
                />
              </div>

              <div>
                <label>LONGITUDE</label>
                <input
                  value={signupForm.longitude}
                  onChange={(e) => updateSignup("longitude", e.target.value)}
                  placeholder="90.4253"
                />
              </div>
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="submit-button" disabled={loading}>
              {loading ? "Registering..." : "Register station"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}