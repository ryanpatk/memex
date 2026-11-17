/*
 * The Memory Cards look's stylesheet and fonts, loaded as one chunk only when
 * the look is on (src/look/look.ts → loadCardsStyles), so the classic look
 * never downloads them. Order matters: tokens, then the kit, then the shell
 * and pages, which compose the kit.
 */
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import './tokens.css';
import './kit.css';
import './shell.css';
import './library.css';
import './journal.css';
import './tasks.css';
import './space.css';
import './settings.css';
import './palette.css';
import './auth.css';
