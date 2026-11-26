import { StyleSheet } from 'react-native';

export const ui = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 14, gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  hint: { fontSize: 13, color: '#64748B' },
  error: { fontSize: 13, color: '#B91C1C' },
  notice: { fontSize: 13, color: '#047857' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  rowText: { flex: 1 },
  divider: { height: 1, backgroundColor: '#E2E8F0' },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#0F172A' },
  button: { backgroundColor: '#2563EB', borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  link: { color: '#1D4ED8', fontSize: 15, fontWeight: '700', paddingVertical: 6 },
  danger: { color: '#B91C1C' },
});
