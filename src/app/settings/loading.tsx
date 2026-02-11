export default function Loading() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <div style={{ width: "min(700px, 94%)" }}>
        <div style={{ height: 16, width: "40%", background: "rgba(148, 163, 184, 0.25)", borderRadius: 9999, marginBottom: 18 }} />
        <div style={{ height: 10, width: "65%", background: "rgba(148, 163, 184, 0.2)", borderRadius: 9999, marginBottom: 26 }} />
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ height: 86, background: "rgba(148, 163, 184, 0.18)", borderRadius: 14 }} />
          <div style={{ height: 86, background: "rgba(148, 163, 184, 0.18)", borderRadius: 14 }} />
          <div style={{ height: 86, background: "rgba(148, 163, 184, 0.18)", borderRadius: 14 }} />
        </div>
      </div>
    </div>
  );
}
