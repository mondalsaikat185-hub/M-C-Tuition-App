export function setupAlertPolyfill() {
  if (typeof window !== 'undefined') {
    window.alert = (message: any) => {
      console.log("Overridden Alert:", message);
      const event = new CustomEvent('show-custom-alert', { detail: String(message) });
      window.dispatchEvent(event);
    };
  }
}
