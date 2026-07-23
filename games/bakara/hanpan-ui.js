(() => {
    'use strict';

    function moveAuthBarIntoHeader() {
        const authBar = document.querySelector('#auth-bar.auth-bar');
        const headerActions = document.querySelector('#app > header.header > .header-right');

        if (!authBar || !headerActions) return;
        headerActions.appendChild(authBar);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', moveAuthBarIntoHeader, { once: true });
    } else {
        moveAuthBarIntoHeader();
    }
})();
