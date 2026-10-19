const r = window.maszynista.renderer, gl = r.gl;
await new Promise((res) => setTimeout(res, 6000));
const out = { states: 0, hasNode: 0, anim: 0, props: {} };
for (const st of gl._nodes.nodeBuilderCache.values()) {
	out.states++;
	const ob = st.observer; if (!ob) continue;
	if (ob.hasNode) { out.hasNode++; const m = ob.builder ? ob.builder.material : null; }
	if (ob.hasAnimation) out.anim++;
}
// które właściwości materiałów w scenie są węzłami
r.scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) for (const k in m) if (m[k] && m[k].isNode) out.props[m.type + '.' + k] = (out.props[m.type + '.' + k] || 0) + 1; });
const ob0 = [...gl._nodes.nodeBuilderCache.values()].find((s) => s.observer && s.observer.hasNode);
out.sampleKeys = ob0 ? Object.keys(ob0.observer).join(',') : null;
return out;
