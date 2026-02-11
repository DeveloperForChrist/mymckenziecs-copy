export default function Loading() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <div style={{ width: "min(620px, 92%)" }}>
        <div style={{ height: 16, width: "45%", background: "rgba(148, 163, 184, 0.25)", borderRadius: 9999, marginBottom: 18 }} />
        <div style={{ height: 10, width: "70%", background: "rgba(148, 163, 184, 0.2)", borderRadius: 9999, marginBottom: 30 }} />
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ height: 18, background: "rgba(148, 163, 184, 0.2)", borderRadius: 8 }} />
          <div style={{ height: 18, background: "rgba(148, 163, 184, 0.2)", borderRadius: 8 }} />
          <div style={{ height: 18, background: "rgba(148, 163, 184, 0.2)", borderRadius: 8 }} />
          <div style={{ height: 18, background: "rgba(148, 163, 184, 0.2)", borderRadius: 8 }} />
        </div>
        <div style={{ height: 44, width: 160, background: "rgba(148, 163, 184, 0.2)", borderRadius: 9999, marginTop: 28 }} />
      </div>
    </div>
  );
}
