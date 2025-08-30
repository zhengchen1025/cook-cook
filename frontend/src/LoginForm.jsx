import { useState } from "react";
import { useAuth } from "./auth/useAuth";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const result = await login(email, password);
      if (!result.ok) {
        setError(result.errors?.[0]?.message || "登录失败");
      }
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        maxWidth: 320,
        margin: "40px auto",
        padding: 24,
        border: "1px solid #eee",
        borderRadius: 8,
      }}
    >
      <h2>登录</h2>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="邮箱"
        style={{ width: "100%", marginBottom: 12, padding: 8 }}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
        style={{ width: "100%", marginBottom: 12, padding: 8 }}
      />
      <button type="submit" style={{ width: "100%", padding: 8 }}>
        登录
      </button>
      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
    </form>
  );
}
