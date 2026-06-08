import { registerRootComponent } from 'expo';

import App from './App';

// Punto de entrada: registra el componente raiz de la app (equivale a AppRegistry.registerComponent('main', () => App))
// Funciona igual tanto si se ejecuta en Expo Go como en una build nativa
registerRootComponent(App);
