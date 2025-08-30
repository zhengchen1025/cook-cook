import { useState } from "react";
import { useAuth } from "./auth/useAuth";

export default function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const { register } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const result = await register(email, password, name);
    if (!result.ok) {
      setError(result.errors?.[0]?.message || "注册失败");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        maxWidth: 320,
        margin: "20px auto",
        padding: 24,
        border: "1px solid #eee",
        borderRadius: 8,
      }}
    >
      <h2>注册</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称 (可选)"
        style={{ width: "100%", marginBottom: 12, padding: 8 }}
      />
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
        注册
      </button>
      {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
    </form>
  );
}
