# MediLink (Demo sin servidor)

Aplicación de demostración para un sistema clínico con:

- Panel de actividad
- Chat interno entre departamentos con adjuntos
- Chat con pacientes y propuesta de citas desde el chat
- Calendario de citas
- Módulo de análisis y diagnóstico potenciado por IA (basada en reglas)
- Guía de uso y tema claro/oscuro

## Uso

1. Abra `index.html` con un servidor estático o directamente en el navegador.
   - Rápido: en /workspace ejecute `python3 -m http.server 8080` y visite `http://localhost:8080/medlink-spa/`
2. Los datos se guardan en `localStorage`. Use “Reiniciar datos” para limpiar.
3. El chat entre departamentos usa `BroadcastChannel` (con fallback por eventos de `localStorage`). Abra dos pestañas para simular usuarios.

## Notas

- No hay backend. Todo corre en el navegador.
- La IA usa heurísticas simples para generar informes explicativos.
- Demo en español enfocada en flujo y facilidad de uso.
