(function () {
  'use strict';

  const RESOURCE_DEFS = [
    { id: 'points', label: '포인트', icon: '✦' },
    { id: 'gold', label: '골드', icon: '●' },
    { id: 'diamonds', label: '다이아', icon: '◆' },
    { id: 'petTicketCount', label: '펫 뽑기권', icon: '🎟' },
    { id: 'holyWaterCount', label: '성수', icon: '💧' }
  ];

  const processed = {
    chat: new WeakSet(),
    mailboxWidget: new WeakSet(),
    mailboxOverlay: new WeakSet(),
    observedSurface: new WeakSet()
  };

  let backdrop = null;
  let dynamicObserver = null;
  let profileTrigger = null;
  let menuTrigger = null;
  let profilePopover = null;
  let menuPopover = null;
  let pendingSurface = null;
  let syncTimer = null;
  let closingSurfaces = false;
  const knownOpenState = new Map();

  function byId(id) {
    return document.getElementById(id);
  }

  function makeElement(tagName, className) {
    const element = document.createElement(tagName);
    element.className = className;
    return element;
  }

  function makeTrigger(className, label, icon, controlsId) {
    const button = makeElement('button', `hp-menu-trigger ${className}`);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', controlsId);
    button.textContent = icon;
    return button;
  }

  function moveIfPresent(parent, element) {
    if (parent && element) {
      parent.appendChild(element);
    }
  }

  function createBackdrop() {
    if (backdrop || !document.body) return;
    backdrop = makeElement('div', 'hp-backdrop');
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', function () {
      closeAllSurfaces();
      queueSurfaceSync();
    });
    document.body.appendChild(backdrop);
  }

  function setPopoverOpen(trigger, popover, open) {
    if (!trigger || !popover) return;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    popover.hidden = !open;
  }

  function closeHeaderPopovers(except) {
    if (except !== 'profile') {
      setPopoverOpen(profileTrigger, profilePopover, false);
    }
    if (except !== 'menu') {
      setPopoverOpen(menuTrigger, menuPopover, false);
    }
  }

  function bindPopover(trigger, popover, name) {
    if (!trigger || !popover) return;
    trigger.addEventListener('click', function () {
      const willOpen = trigger.getAttribute('aria-expanded') !== 'true';
      closeHeaderPopovers(willOpen ? name : null);
      setPopoverOpen(trigger, popover, willOpen);
    });
    popover.addEventListener('click', function (event) {
      if (event.target instanceof Element && event.target.closest('button')) {
        closeHeaderPopovers();
      }
    });
  }

  function enhanceHeader(header) {
    if (!header || header.dataset.hpEnhanced === 'true') return;
    header.dataset.hpEnhanced = 'true';
    header.classList.add('hp-header');

    const main = makeElement('div', 'hp-header-main');
    const resources = makeElement('div', 'hp-resource-strip');
    resources.setAttribute('aria-label', '보유 자원');
    const actions = makeElement('div', 'hp-header-actions');

    profilePopover = makeElement('div', 'hp-popover hp-profile-popover');
    profilePopover.id = 'hpProfilePopover';
    profilePopover.hidden = true;
    profilePopover.setAttribute('aria-label', '프로필 메뉴');

    menuPopover = makeElement('div', 'hp-popover hp-menu-popover');
    menuPopover.id = 'hpMainPopover';
    menuPopover.hidden = true;
    menuPopover.setAttribute('aria-label', '게임 메뉴');

    profileTrigger = makeTrigger(
      'hp-profile-trigger',
      '프로필 메뉴',
      '👤',
      profilePopover.id
    );
    menuTrigger = makeTrigger(
      'hp-main-menu-trigger',
      '게임 메뉴',
      '☰',
      menuPopover.id
    );

    moveIfPresent(main, header.querySelector('.title-section'));
    moveIfPresent(main, header.querySelector('.hint'));

    RESOURCE_DEFS.forEach(function (definition) {
      const value = byId(definition.id);
      const chip = value && value.closest('span');
      if (!chip) return;
      chip.classList.add('hp-resource-chip');
      chip.dataset.hpIcon = definition.icon;
      if (!chip.hasAttribute('title')) {
        chip.title = definition.label;
      }
      resources.appendChild(chip);
    });

    moveIfPresent(profilePopover, byId('whoami'));
    moveIfPresent(profilePopover, header.querySelector('.sep'));
    moveIfPresent(profilePopover, byId('toUser'));
    moveIfPresent(profilePopover, byId('toAdmin'));
    moveIfPresent(profilePopover, byId('logoutBtn'));
    moveIfPresent(menuPopover, byId('questBtn'));
    moveIfPresent(menuPopover, byId('userOptionsBtn'));

    actions.append(profileTrigger, menuTrigger, profilePopover, menuPopover);
    main.appendChild(actions);
    header.append(main, resources);

    bindPopover(profileTrigger, profilePopover, 'profile');
    bindPopover(menuTrigger, menuPopover, 'menu');
  }

  function getSurfaceConfigs() {
    return [
      {
        name: 'quest',
        element: byId('questOverlay'),
        isOpen: function (element) {
          return Boolean(element && !element.hidden);
        },
        closeSelector: '#questClose'
      },
      {
        name: 'options',
        element: byId('userOptionsModal'),
        isOpen: function (element) {
          return Boolean(element && !element.hidden);
        },
        closeSelector: '#userOptionsClose'
      },
      {
        name: 'mailbox',
        element: document.querySelector('.mailbox-overlay'),
        isOpen: function (element) {
          return Boolean(element && element.classList.contains('open'));
        },
        closeSelector: '.mailbox-close'
      },
      {
        name: 'chat',
        element: document.querySelector('.global-chat'),
        isOpen: function (element) {
          return Boolean(
            element
            && processed.chat.has(element)
            && !element.classList.contains('is-hidden')
          );
        },
        closeSelector: '.global-chat__button--hide'
      }
    ];
  }

  function isSurfaceOpen(config) {
    return Boolean(config && config.element && config.isOpen(config.element));
  }

  function clickSurfaceClose(config) {
    if (!config || !config.element) return;
    const closeButton = config.element.querySelector(config.closeSelector)
      || document.querySelector(config.closeSelector);
    if (closeButton instanceof HTMLElement) {
      closeButton.click();
    }
  }

  function closeAllSurfaces(exceptName) {
    if (closingSurfaces) return;
    closingSurfaces = true;
    getSurfaceConfigs().forEach(function (config) {
      if (config.name !== exceptName && isSurfaceOpen(config)) {
        clickSurfaceClose(config);
      }
    });
    closingSurfaces = false;
  }

  function updateSurfaceAccessibility(activeConfigs) {
    const chat = document.querySelector('.global-chat');
    const chatFloating = document.querySelector('.global-chat__floating-btn');
    const chatOpen = activeConfigs.some(function (config) {
      return config.name === 'chat';
    });
    if (chat && chatFloating) {
      if (!chat.id) chat.id = 'hpWorldChatSheet';
      chatFloating.setAttribute('aria-controls', chat.id);
      chatFloating.setAttribute('aria-expanded', chatOpen ? 'true' : 'false');
    }
  }

  function synchronizeSurfaces(preferredName) {
    syncTimer = null;
    const configs = getSurfaceConfigs();
    let active = configs.filter(isSurfaceOpen);
    const newlyOpened = active.filter(function (config) {
      return knownOpenState.get(config.name) !== true;
    });
    const keepName = preferredName
      || pendingSurface
      || (newlyOpened.length ? newlyOpened[newlyOpened.length - 1].name : null);

    if (active.length > 1) {
      const keep = keepName || active[active.length - 1].name;
      closeAllSurfaces(keep);
      active = configs.filter(function (config) {
        return config.name === keep && isSurfaceOpen(config);
      });
    }

    configs.forEach(function (config) {
      knownOpenState.set(config.name, isSurfaceOpen(config));
    });
    pendingSurface = null;

    const hasActiveSurface = active.length > 0;
    if (backdrop) {
      backdrop.hidden = !hasActiveSurface;
      backdrop.classList.toggle('is-active', hasActiveSurface);
      backdrop.setAttribute('aria-hidden', hasActiveSurface ? 'false' : 'true');
    }
    document.body.classList.toggle('hp-surface-open', hasActiveSurface);
    updateSurfaceAccessibility(active);
  }

  function queueSurfaceSync(preferredName) {
    if (preferredName) pendingSurface = preferredName;
    if (syncTimer !== null) return;
    syncTimer = window.setTimeout(function () {
      synchronizeSurfaces(pendingSurface);
    }, 0);
  }

  function observeSurface(name, element) {
    if (!element || processed.observedSurface.has(element)) return;
    processed.observedSurface.add(element);
    const observer = new MutationObserver(function () {
      const config = getSurfaceConfigs().find(function (candidate) {
        return candidate.name === name;
      });
      const justOpened = config
        && isSurfaceOpen(config)
        && knownOpenState.get(name) !== true;
      queueSurfaceSync(justOpened ? name : null);
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'hidden']
    });
    const config = getSurfaceConfigs().find(function (candidate) {
      return candidate.name === name;
    });
    knownOpenState.set(name, isSurfaceOpen(config));
  }

  function ensureExpandedChat(chat) {
    if (!chat || chat.classList.contains('is-hidden')) return;
    const toggle = chat.querySelector('.global-chat__button[aria-expanded]');
    if (toggle instanceof HTMLElement && toggle.getAttribute('aria-expanded') !== 'true') {
      toggle.click();
    }
  }

  function processChat(chat) {
    if (!chat || processed.chat.has(chat)) return;
    processed.chat.add(chat);
    const hideButton = chat.querySelector('.global-chat__button--hide');
    if (
      !chat.classList.contains('is-hidden')
      && hideButton instanceof HTMLElement
    ) {
      hideButton.click();
    }
    observeSurface('chat', chat);
    queueSurfaceSync();
  }

  function processMailboxWidget(widget) {
    if (!widget || processed.mailboxWidget.has(widget)) return;
    processed.mailboxWidget.add(widget);
    if (menuPopover) {
      menuPopover.appendChild(widget);
    }
  }

  function processMailboxOverlay(overlay) {
    if (!overlay || processed.mailboxOverlay.has(overlay)) return;
    processed.mailboxOverlay.add(overlay);
    observeSurface('mailbox', overlay);
    queueSurfaceSync();
  }

  function processDynamicRoot(root) {
    if (!(root instanceof Element) && root !== document) return;

    const chat = root instanceof Element && root.matches('.global-chat')
      ? root
      : root.querySelector('.global-chat');
    const mailboxWidget = root instanceof Element && root.matches('.mailbox-widget')
      ? root
      : root.querySelector('.mailbox-widget');
    const mailboxOverlay = root instanceof Element && root.matches('.mailbox-overlay')
      ? root
      : root.querySelector('.mailbox-overlay');

    processChat(chat);
    processMailboxWidget(mailboxWidget);
    processMailboxOverlay(mailboxOverlay);
  }

  function watchDynamicElements() {
    processDynamicRoot(document);
    dynamicObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node instanceof Element) {
            processDynamicRoot(node);
          }
        });
      });
    });
    dynamicObserver.observe(document.body, { childList: true, subtree: true });
  }

  function surfaceNameForTrigger(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest('#questBtn')) return 'quest';
    if (target.closest('#userOptionsBtn')) return 'options';
    if (target.closest('.mailbox-button')) return 'mailbox';
    if (target.closest('.global-chat__floating-btn')) return 'chat';
    return null;
  }

  function bindGlobalControls() {
    document.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const surfaceName = surfaceNameForTrigger(target);
      if (surfaceName) {
        pendingSurface = surfaceName;
        closeAllSurfaces(surfaceName);
        if (surfaceName === 'chat') {
          window.setTimeout(function () {
            ensureExpandedChat(document.querySelector('.global-chat'));
            queueSurfaceSync('chat');
          }, 0);
        } else {
          queueSurfaceSync(surfaceName);
        }
      } else if (target.closest('.bottom-nav__button')) {
        closeAllSurfaces();
        closeHeaderPopovers();
        queueSurfaceSync();
      }

      if (!target.closest('.hp-header-actions')) {
        closeHeaderPopovers();
      }
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      const active = getSurfaceConfigs().filter(isSurfaceOpen);
      if (active.length) {
        closeAllSurfaces();
        queueSurfaceSync();
      } else {
        closeHeaderPopovers();
      }
    });
  }

  function boot() {
    const header = document.querySelector('header.top');
    if (!header || !document.body) return;

    document.body.classList.add('hp-ui-ready');
    enhanceHeader(header);
    createBackdrop();
    observeSurface('quest', byId('questOverlay'));
    observeSurface('options', byId('userOptionsModal'));
    bindGlobalControls();
    watchDynamicElements();
    queueSurfaceSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
