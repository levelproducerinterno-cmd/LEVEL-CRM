# Level CRM (Producción)

Sistema interno de Level Producer para gestionar clientes en tiempo real: **Clientes** (ficha por cliente con Junta de Aterrizaje, Expediente, Cuentas y Contraseñas, Guiones), **Edición** y **Community Manager**.

Es una app viva (no un generador de PDF aislado): todo el equipo la abre y ve/edita los mismos datos en tiempo real contra el Apps Script compartido de "BASE DE DATOS - LEVEL".

## Despliegue

Este repo solo necesita `index.html`. Se conecta directo a Vercel como sitio estático, sin build.

## Notas

- Comparte el mismo Apps Script y Google Sheet que el resto de los sistemas de Level Producer.
- La sub-pestaña **Expediente** dentro de cada cliente se autocompleta desde la Junta de Aterrizaje y genera su propio PDF.
