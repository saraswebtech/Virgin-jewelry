(function () {
	'use strict';

	var API_URL    = 'https://demo.awaikenthemes.com/landing/wp-json/ath/v1/themes';
	var CACHE_KEY  = 'ath_themes_map_v1';
	var CACHE_TTL  = 12 * 60 * 60 * 1000; // 12 hours
	var SOURCE_KEY = 'ath_purchase_source';   // shared with the landing page switcher
	var TF_REFERRED_KEY = 'ath_tf_referred';  // shared with the landing page switcher
	var TF_MARKER = 'ath_ref';                // carries a ThemeForest visit across tabs/domains
	var PREVIEW_FRAME_NAME = 'preview-frame'; // ThemeForest's full-screen preview iframe
	var LANDING_BASE = 'https://demo.awaikenthemes.com/landing/';

	// Legacy demos whose slug differs from the landing post slug.
	var SLUG_ALIASES = {
		'artistics': 'artistic'
	};

	var pathSlug = window.location.pathname.split('/').filter(Boolean)[0] || '';
	if (!pathSlug) {
		return;
	}

	var isHtml   = window.location.hostname.indexOf('html.') === 0;
	var baseSlug = pathSlug.replace(/^theme-/, '');
	baseSlug = SLUG_ALIASES[baseSlug] || baseSlug;
	var landingKey = isHtml ? baseSlug + '-html' : baseSlug;

	/* ---------------------------------------------------------------------
	 * Two independent questions are answered here — keeping them apart is what
	 * makes the ThemeForest flow work:
	 *
	 *   getLinkSource()          Which purchase link to show. Inside a
	 *                            marketplace preview iframe the visitor must be
	 *                            sent to that marketplace; everywhere else we
	 *                            sell from our own site.
	 *
	 *   isThemeForestReferred()  Whether the visit started at ThemeForest. Only
	 *                            these visits get UTM parameters. The answer
	 *                            travels with the visitor through TF_MARKER,
	 *                            because demos open in a new tab (and on a
	 *                            different sub-domain for HTML templates),
	 *                            where sessionStorage cannot be relied on.
	 * ------------------------------------------------------------------ */

	function isFramed() {
		try {
			return window.self !== window.top;
		} catch (e) {
			return true;
		}
	}

	function referrerHost() {
		try {
			return document.referrer ? new URL(document.referrer).hostname : '';
		} catch (e) {
			return '';
		}
	}

	function getLinkSource() {
		// Not embedded anywhere: sell from our own site, whoever sent them.
		if (!isFramed()) {
			return 'at';
		}

		var stored = '';
		try {
			stored = sessionStorage.getItem(SOURCE_KEY) || '';
		} catch (e) {}

		// Only trusted while embedded, so a demo opened in a new tab (which can
		// inherit sessionStorage) is never stuck on the marketplace link.
		if (stored === 'tf' || stored === 'tm') {
			return stored;
		}

		var source = /(^|\.)templatemonster\.com$/i.test(referrerHost()) ? 'tm' : 'tf';

		try {
			sessionStorage.setItem(SOURCE_KEY, source);
		} catch (e) {}

		return source;
	}

	// Keep the marker out of the address bar once it has been recorded.
	function cleanMarkerFromUrl() {
		try {
			var url = new URL(window.location.href);
			if (!url.searchParams.has(TF_MARKER)) {
				return;
			}
			url.searchParams.delete(TF_MARKER);
			window.history.replaceState({}, '', url.toString());
		} catch (e) {}
	}

	function isThemeForestReferred() {
		var stored = '';
		try {
			stored = sessionStorage.getItem(TF_REFERRED_KEY) || '';
		} catch (e) {}

		if (stored === '1') {
			return true;
		}

		var params = null;
		try {
			params = new URL(window.location.href).searchParams;
		} catch (e) {}

		var referred = false;

		if (params && (params.get(TF_MARKER) === 'tf' || params.get('utm_source') === 'themeforest')) {
			// Opened from a page that already knew the visit came from ThemeForest.
			referred = true;
		} else if (/(^|\.)themeforest\.net$/i.test(referrerHost())) {
			referred = true;
		} else if (isFramed() && window.name === PREVIEW_FRAME_NAME) {
			// The preview embeds us as <iframe name="preview-frame">, which
			// identifies ThemeForest even when the referrer is stripped.
			referred = true;
		}

		if (referred) {
			try {
				sessionStorage.setItem(TF_REFERRED_KEY, '1');
			} catch (e) {}
			cleanMarkerFromUrl();
		}

		return referred;
	}

	/**
	 * Campaign parameters for an outbound link.
	 *
	 * When this page was reached with campaign parameters — handed over by the
	 * landing page, which in turn may have got them from the HTML demo
	 * cross-sell popup — they are carried through unchanged, so a sale stays
	 * attributed to the path that actually produced it rather than being
	 * relabelled at every hop. Untagged visitors get parameters for this page.
	 */
	function campaignTags(placement) {
		var tags = {
			source: 'themeforest',
			medium: isHtml ? 'html-demo' : 'wp-demo',
			campaign: baseSlug,
			content: placement
		};

		try {
			var params = new URL(window.location.href).searchParams;

			if (params.get('utm_source')) {
				tags.source = params.get('utm_source');
				tags.medium = params.get('utm_medium') || tags.medium;
				tags.campaign = params.get('utm_campaign') || tags.campaign;
				tags.content = params.get('utm_content') || tags.content;
			}
		} catch (e) {}

		return tags;
	}

	// UTM parameters are added only for ThemeForest-referred visitors, and only
	// on links pointing to awaikenthemes.com. Marketplace links (Envato,
	// TemplateMonster) and organic or direct visits are left untouched.
	function withTracking(link, placement) {
		if (!link || !isThemeForestReferred()) {
			return link;
		}

		try {
			var url = new URL(link);
			if (!/(^|\.)awaikenthemes\.com$/i.test(url.hostname)) {
				return link;
			}
			if (url.searchParams.has('utm_source')) {
				return link;
			}

			var tags = campaignTags(placement);

			url.searchParams.set('utm_source', tags.source);
			url.searchParams.set('utm_medium', tags.medium);
			url.searchParams.set('utm_campaign', tags.campaign);
			url.searchParams.set('utm_content', tags.content);
			return url.toString();
		} catch (e) {
			return link;
		}
	}

	/* ---------------------------------------------------------------------
	 * Theme map: localStorage cache -> REST API -> stale cache fallback
	 * ------------------------------------------------------------------ */

	function readCache() {
		try {
			return JSON.parse(localStorage.getItem(CACHE_KEY));
		} catch (e) {
			return null;
		}
	}

	function getThemes(callback) {
		var cached = readCache();

		if (cached && cached.data && (Date.now() - cached.t) < CACHE_TTL) {
			callback(cached.data);
			return;
		}

		fetch(API_URL)
			.then(function (response) {
				if (!response.ok) {
					throw new Error('HTTP ' + response.status);
				}
				return response.json();
			})
			.then(function (data) {
				try {
					localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data }));
				} catch (e) {}
				callback(data);
			})
			.catch(function () {
				// API unreachable: fall back to the stale cache if we have one.
				callback(cached && cached.data ? cached.data : null);
			});
	}

	/* ---------------------------------------------------------------------
	 * Panel rendering
	 * ------------------------------------------------------------------ */

	function buildPanel(themes) {
		if (!themes || !themes[landingKey]) {
			return;
		}

		var entry  = themes[landingKey];
		var source = getLinkSource();

		var buyLink;
		if (source === 'tf') {
			buyLink = entry.tf || entry.at;
		} else if (source === 'tm') {
			buyLink = entry.tm || entry.at;
		} else {
			buyLink = entry.at || entry.tf;
		}
		var docLink = entry.doc || '';
		var landingLink = LANDING_BASE + landingKey + '/';

		// On an HTML demo, offer the WordPress demo popup when a WP landing
		// post exists for the same theme.
		var wpDemo = '';
		var buynow_text = 'Theme';
		if (isHtml && themes[baseSlug]) {
			wpDemo = LANDING_BASE + baseSlug + '/';
			buynow_text = 'HTML';
		}

		if (!buyLink && !docLink) {
			return;
		}

		var themePanel = `
		${!isHtml?`
		<div class="explore_theme_panel">
			${buyLink ? `<img src="https://demo.awaikenthemes.com/assets/js/right-arrow.gif" class="animated-arrow"> <a href="${withTracking(buyLink, 'theme-panel')}" target="_blank" class="btn-buynow" title="Buy Now ${buynow_text}"><i class="fas fa-cart-shopping"></i> Buy Now</a>` : ''}
			${docLink ? `<a href="${docLink}" target="_blank" class="btn-doc" title="Documentation"><i class="fas fa-file-lines"></i></a>` : ''}
			${wpDemo ? `<a href="${wpDemo}" target="_blank" title="WordPress Theme Demo"><i class="fa-brands fa-wordpress"></i></a>` : ''}
		</div>
		
		<div class="offer-banner">
			<p><span class="desktop">&#128293; Purchase Today &amp; Enjoy UP TO 35% Off</span><span class="tablet-mobile">&#128293; Purchase &amp; Enjoy UP TO 35% Off</span></p>
			<a href="${withTracking(buyLink, 'offer-banner')}" class="offer-btn" title="Buy WordPress Theme">Buy Now</a>
			<img src="https://demo.awaikenthemes.com/assets/js/right-arrow.gif" class="offer-animated-arrow">
		</div>` : ''}
		${false?`
		<div class="offer-banner">
			<p><span class="desktop">&#128293; Limited Time Offer — Get ${baseSlug} WordPress Theme at a Special Price! </span><span class="tablet-mobile">&#128293; Purchase WP Theme &amp; Enjoy UP TO 35% Off</span></p>
			<a href="${wpDemo}" class="offer-btn" title="View WordPress Theme Demo">View Demo</a>
		</div>` : ''}
		<style type="text/css">
			.explore_theme_panel {
				position: fixed;
				right: 20px;
				bottom: 20px;
				z-index: 10000;
				display: flex;
			}
			.explore_theme_panel a {
				position: relative;
				height: 46px;
				align-items: center;
				justify-content: center;
				font-size: 16px;
				font-weight: 600;
				color: #1d2327;
				background: #D2E761;
				transition: all 0.4s ease-in-out;
				margin-left: 10px;
				line-height: 46px;
				padding: 0px 30px;
				border: 1px solid #D2E761;
				border-radius: 30px;
			}
			
			.animated-arrow{
				height: 46px !important;
				margin-right: -10px;
				filter: contrast(0);
			}			
			
			.explore_theme_panel a.btn-buynow i{
				margin-right: 4px;
			}
			
			.explore_theme_panel a:hover{
				color: #fff;
				background: #1d2327;
				border-color: #ffffff40;
			}
			
			.explore_theme_panel a.btn-doc{
				width: 46px;
				padding: 0;
				text-align: center;
				color: #fff;
				background: #1d2327;
				display: none;
			}
			
			.explore_theme_panel a.btn-doc i{
				font-size: 22px;
				position: relative;
				top: 2px;
			}
			
			.offer-banner img,
			.demo-theme-popup img {
				width: 16px;
				height: auto;
			}
			body.offer-banner-active {
				margin-top: 56px;
				position: relative;
			}
			.offer-banner {
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				height: 56px;
				background: #F8FBEF;
				box-shadow: 0 0 10px #00000010;
				padding: 10px 20px;
				z-index: 999;
				text-align: center;
				display: flex;
				align-items: center;
				justify-content: center;
			}
			.offer-banner p {
				color: #000;
				margin: 0;
				font-weight: 600;
				font-size: 16px;
			}
			a.offer-btn {
				background: #D2E761;
				color: #000;
				padding: 6px 24px;
				font-size: 16px;
				font-weight:600;
				line-height: 1.4em;
				border-radius: 40px;
				margin-left: 20px;
			}
			
			a.offer-btn:hover{
				background: #1d2327;
				color: #fff;
			}
			
			.offer-banner .tablet-mobile {
				display: none;
			}
			
			img.offer-animated-arrow{
				transform: rotate(180deg);
				height: 32px;
				width: auto;
				position: relative;
				top: 4px;
			}
			
			@media only screen and (max-width: 991px) {
				
				.offer-banner{
					z-index: 99;
				}
				
				.offer-banner .tablet-mobile {
					display: block;
				}
				.offer-banner .desktop,
				img.offer-animated-arrow{
					display: none;
				}
				.offer-banner p {
					font-size: 15px;
				}
				
				a.offer-btn {
					font-size: 14px;
					margin-left: 10px;
					min-width: 116px;
				}
			}
			
			.demo-theme-popup {
				position: fixed;
				bottom: 24px;
				right: -390px;
				width: 340px;
				background: #1d2327;
				border: 1px solid #ffffff20;
				border-radius: 14px;
				padding: 22px 22px 20px;
				transition: right 0.6s cubic-bezier(0.16, 1, 0.3, 1);
				z-index: 9999;
				overflow: hidden;
			}

			.demo-theme-popup.show {
				right: 20px;
			}

			.demo-theme-popup::before {
				content: "";
				position: absolute;
				top: -60px;
				right: -60px;
				width: 140px;
				height: 140px;
				background: radial-gradient(circle, #d2e76150, transparent 70%);
				pointer-events: none;
			}
			
			span.html-popup-close {
				position: absolute;
				top: 10px;
				right: 10px;
				width: 20px;
				height: 20px;
				background: #ffffff30;
				text-align: center;
				line-height: 20px;
				font-family: "Space Grotesk", sans-serif;
				border-radius: 20px;
				color: #fff;
				cursor: pointer;
				transition: all 0.3s ease-in-out;
			}
			
			span.html-popup-close:hover{
				background: #d2e761;
				color: #1d2327;
			}

			.cta-badge {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				background: #d2e76120;
				border: 1px solid #d2e76160;
				color: #d2e761;
				font-family: "Space Grotesk", sans-serif;
				font-weight: 700;
				font-size: 11px;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				padding: 2px 10px;
				border-radius: 20px;
				margin-bottom: 14px;
			}
			
			.cta-badge .dot {
				width: 6px;
				height: 6px;
				border-radius: 50%;
				background: #d2e761;
				animation: pulse 1.4s infinite;
			}
			
			@keyframes pulse {
				0%,
				100% {
					opacity: 1;
					transform: scale(1);
				}
				50% {
					opacity: 0.4;
					transform: scale(0.75);
				}
			}

			.cta-headline {
				font-family: "Space Grotesk", sans-serif;
				font-weight: 700;
				font-size: 19px;
				color: #f5f1ff;
				line-height: 1.3;
				margin-bottom: 6px;
			}
			.cta-headline span {
				color: #d2e761;
				text-transform: capitalize;
			}

			.cta-sub {
				font-size: 13px;
				color: #ffffffbb;
				line-height: 1.5;
				margin-bottom: 16px;
			}

			.demo-theme-popup .cta-btn {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 8px;
				width: 100%;
				background: #d2e761;
				color: #1d2327;
				font-family: "Space Grotesk", sans-serif;
				font-weight: 700;
				font-size: 14px;
				border: none;
				border-radius: 8px;
				padding: 14px;
				height: 44px;
				cursor: pointer;
				transition: transform 0.15s ease, box-shadow 0.2s ease;
				box-shadow: 0 6px 18px #d2e76150;
				margin: 0 !important;
				box-sizing: border-box;
				text-decoration: none;
			}
			.demo-theme-popup .cta-btn:hover {
				transform: translateY(-2px);
				background: #d2e761;
				color: #1d2327;
				box-shadow: 0 10px 24px #d2e76150;
				text-decoration: none;
			}
			.demo-theme-popup .cta-btn:active,
			.demo-theme-popup .cta-btn:focus {
				transform: translateY(0);
				background: #d2e761;
				color: #1d2327;
			}
			
			.cta-btn svg {
				width: 15px;
				height: 15px;
			}

			@media (max-width: 767px) {
				.demo-theme-popup {
					display: none;
				}
			}

		</style>`;

		document.body.insertAdjacentHTML('beforeend', themePanel);
		if(!isHtml) {
		document.body.classList.add('offer-banner-active');
		}


		// In-page buttons: .buy-link points to the purchase link,
		// .demo-link points to the theme's landing page.
		if (buyLink) {
			var trackedBuyLink = withTracking(buyLink, 'buy-link');
			document.querySelectorAll('.buy-link').forEach(function (element) {
				element.href = trackedBuyLink;
			});
		}
		var trackedLandingLink = withTracking(landingLink, 'demo-link');
		document.querySelectorAll('.demo-link').forEach(function (element) {
			element.href = trackedLandingLink;
		});

		if (wpDemo) {
			var popup = document.createElement('div');
			popup.classList.add('demo-theme-popup');
			popup.innerHTML = `<div class="">
				<span class="html-popup-close">&times;</span>
				<span class="cta-badge"><span class="dot"></span>Limited time offer</span>
				<div class="cta-headline">Get <span>${baseSlug}</span> at Up to 35% Off</div>
				<div class="cta-sub">A fast, flexible WordPress theme built for creators who want their site live today.</div>
				<a href="${withTracking(wpDemo, 'crosssell-popup')}" target="_blank" class="cta-btn" title="WordPress Theme Demo">View Demo<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
			</div>`;
			document.body.appendChild(popup);

			var popupClosed = false;

			window.addEventListener('scroll', function () {
				if (popupClosed) {
					return;
				}
				var threshold = 200;
				if (window.scrollY >= threshold) {
					popup.style.right = '20px';
				} else {
					popup.style.right = '-390px';
				}
			});

			popup.querySelector('.html-popup-close').addEventListener('click', function () {
				popupClosed = true;
				popup.style.display = 'none';
			});
		}
	}

	function init() {
		getThemes(buildPanel);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
(function() {
	if (document.getElementById('gtm-script-dynamic')) return;
	var gtmScript = document.createElement('script');
	gtmScript.id = 'gtm-script-dynamic';
	gtmScript.async = true;
	gtmScript.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-PRHSXCHZ';

	window.dataLayer = window.dataLayer || [];
	window.dataLayer.push({
		'gtm.start': new Date().getTime(),
		event: 'gtm.js'
	});

	document.head.appendChild(gtmScript);
})();