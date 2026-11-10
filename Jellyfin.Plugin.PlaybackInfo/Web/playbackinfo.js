/*
 * Playback Info for Jellyfin 12
 * ---------------------------------------------------------------------------
 * Adds one unobtrusive line to the web player's on-screen controls (OSD):
 * resolution, video codec, HDR, bitrate and the play method (Direct Play,
 * Direct Stream or Transcoding, with the server's transcode reasons).
 *
 * Design:
 *  - The line lives inside jellyfin-web's own bottom OSD (.videoOsdBottom), right
 *    below the title block, so it appears and disappears together with the
 *    playback controls. No own timers for showing/hiding, no overlay on the video.
 *  - Data comes from the server's view of this very client: the session with our
 *    device id (PlayState.PlayMethod, TranscodingInfo incl. TranscodeReasons) plus
 *    the item's MediaSources for the original stream. That is the same data the
 *    dashboard's "Active devices" uses, so both always agree.
 *  - Requests run only while the controls are visible (every 5 s), so a paused or
 *    hidden player causes no traffic.
 *  - Nothing global is overwritten; the only global is window.PlaybackInfoOsd.
 */
(function () {
    'use strict';

    if (window.PlaybackInfoOsd && window.PlaybackInfoOsd.loaded) {
        return;
    }

    var DEFAULTS = {
        enabled: true,
        showCodec: true,
        showHdr: true,
        showBitrate: true,
        showAudio: false,
        showSource: true,
        showReasons: true
    };

    var cfg = Object.assign({}, DEFAULTS, window.PlaybackInfoOsdConfig || {});
    if (!cfg.enabled) {
        return;
    }

    var TICK_MS = 1000;
    var REFRESH_MS = 5000;
    var ITEM_CACHE_MAX = 20;

    // ------------------------------------------------------------------ i18n
    var STRINGS = {
        en: {
            directPlay: 'Direct Play',
            directStream: 'Direct Stream',
            transcode: 'Transcoding',
            audioOnly: 'audio only',
            source: 'Source',
            output: 'Output',
            reasons: 'Reason',
            hw: 'Hardware acceleration',
            sw: 'Software',
            playMethod: 'Play method',
            container: 'Container',
            video: 'Video',
            audio: 'Audio',
            bitrate: 'Bitrate',
            progress: 'Transcoded',
            target: 'max.',
            directPlayHint: 'The file is played as it is.',
            directStreamHint: 'Video and audio are passed through, only the container is changed.'
        },
        de: {
            directPlay: 'Direct Play',
            directStream: 'Direct Stream',
            transcode: 'Transcoding',
            audioOnly: 'nur Audio',
            source: 'Quelle',
            output: 'Ausgabe',
            reasons: 'Grund',
            hw: 'Hardwarebeschleunigung',
            sw: 'Software',
            playMethod: 'Wiedergabeart',
            container: 'Container',
            video: 'Video',
            audio: 'Audio',
            bitrate: 'Bitrate',
            progress: 'Transkodiert',
            target: 'max.',
            directPlayHint: 'Die Datei wird unverändert abgespielt.',
            directStreamHint: 'Video und Audio werden durchgereicht, nur der Container wird gewechselt.'
        }
    };

    // Jellyfin's TranscodeReason enum, as short, readable texts.
    var REASONS = {
        en: {
            ContainerNotSupported: 'container not supported',
            VideoCodecNotSupported: 'video codec not supported',
            AudioCodecNotSupported: 'audio codec not supported',
            SubtitleCodecNotSupported: 'subtitles are burned in',
            AudioIsExternal: 'external audio track',
            SecondaryAudioNotSupported: 'secondary audio track not supported',
            VideoProfileNotSupported: 'video profile not supported',
            VideoLevelNotSupported: 'video level not supported',
            VideoResolutionNotSupported: 'resolution not supported',
            VideoBitDepthNotSupported: 'video bit depth not supported',
            VideoFramerateNotSupported: 'frame rate not supported',
            RefFramesNotSupported: 'reference frames not supported',
            AnamorphicVideoNotSupported: 'anamorphic video not supported',
            InterlacedVideoNotSupported: 'interlaced video not supported',
            AudioChannelsNotSupported: 'audio channels not supported',
            AudioProfileNotSupported: 'audio profile not supported',
            AudioSampleRateNotSupported: 'audio sample rate not supported',
            AudioBitDepthNotSupported: 'audio bit depth not supported',
            ContainerBitrateExceedsLimit: 'bitrate above the limit',
            VideoBitrateNotSupported: 'video bitrate above the limit',
            AudioBitrateNotSupported: 'audio bitrate above the limit',
            UnknownVideoStreamInfo: 'unknown video stream',
            UnknownAudioStreamInfo: 'unknown audio stream',
            DirectPlayError: 'direct play failed',
            VideoRangeTypeNotSupported: 'HDR format not supported',
            VideoCodecTagNotSupported: 'video codec tag not supported',
            StreamCountExceedsLimit: 'too many streams'
        },
        de: {
            ContainerNotSupported: 'Container nicht unterstützt',
            VideoCodecNotSupported: 'Videocodec nicht unterstützt',
            AudioCodecNotSupported: 'Audiocodec nicht unterstützt',
            SubtitleCodecNotSupported: 'Untertitel werden eingebrannt',
            AudioIsExternal: 'externe Audiospur',
            SecondaryAudioNotSupported: 'zweite Audiospur nicht unterstützt',
            VideoProfileNotSupported: 'Videoprofil nicht unterstützt',
            VideoLevelNotSupported: 'Video-Level nicht unterstützt',
            VideoResolutionNotSupported: 'Auflösung nicht unterstützt',
            VideoBitDepthNotSupported: 'Farbtiefe nicht unterstützt',
            VideoFramerateNotSupported: 'Bildrate nicht unterstützt',
            RefFramesNotSupported: 'Referenzframes nicht unterstützt',
            AnamorphicVideoNotSupported: 'anamorphes Video nicht unterstützt',
            InterlacedVideoNotSupported: 'Interlaced-Video nicht unterstützt',
            AudioChannelsNotSupported: 'Audiokanäle nicht unterstützt',
            AudioProfileNotSupported: 'Audioprofil nicht unterstützt',
            AudioSampleRateNotSupported: 'Abtastrate nicht unterstützt',
            AudioBitDepthNotSupported: 'Audio-Bittiefe nicht unterstützt',
            ContainerBitrateExceedsLimit: 'Bitrate über dem Limit',
            VideoBitrateNotSupported: 'Videobitrate über dem Limit',
            AudioBitrateNotSupported: 'Audiobitrate über dem Limit',
            UnknownVideoStreamInfo: 'unbekannter Videostream',
            UnknownAudioStreamInfo: 'unbekannter Audiostream',
            DirectPlayError: 'Direct Play fehlgeschlagen',
            VideoRangeTypeNotSupported: 'HDR-Format nicht unterstützt',
            VideoCodecTagNotSupported: 'Codec-Tag nicht unterstützt',
            StreamCountExceedsLimit: 'zu viele Streams'
        }
    };

    function lang() {
        var l = (document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase();
        return l.indexOf('de') === 0 ? 'de' : 'en';
    }

    function t(key) {
        return (STRINGS[lang()] || STRINGS.en)[key] || STRINGS.en[key] || key;
    }

    function reasonText(r) {
        return (REASONS[lang()] || REASONS.en)[r] || REASONS.en[r] || r;
    }

    // ------------------------------------------------------------------ formatting
    var CODECS = {
        h264: 'H.264', avc: 'H.264', hevc: 'HEVC', h265: 'HEVC', av1: 'AV1', vp9: 'VP9', vp8: 'VP8',
        mpeg2video: 'MPEG-2', mpeg4: 'MPEG-4', vc1: 'VC-1', msmpeg4v3: 'DivX', h263: 'H.263',
        aac: 'AAC', ac3: 'AC3', eac3: 'E-AC3', dts: 'DTS', truehd: 'TrueHD', flac: 'FLAC', mp3: 'MP3',
        opus: 'Opus', vorbis: 'Vorbis', alac: 'ALAC', mp2: 'MP2'
    };

    function codecName(c) {
        if (!c) {
            return '';
        }
        var k = String(c).toLowerCase();
        return CODECS[k] || String(c).toUpperCase();
    }

    function resolutionName(w, h) {
        w = w || 0;
        h = h || 0;
        if (!w && !h) {
            return '';
        }
        // Effective 16:9 height, so cropped cinemascope (1920x800) still counts as 1080p
        // and 4:3 PAL (720x576) as 576p.
        var e = Math.max(h, Math.round(w * 9 / 16));
        if (e >= 2000) return '4K';
        if (e >= 1300) return '1440p';
        if (e >= 1000) return '1080p';
        if (e >= 700) return '720p';
        if (e >= 560) return '576p';
        if (e >= 520) return '540p';
        if (e >= 460) return '480p';
        if (e >= 340) return '360p';
        return e + 'p';
    }

    function rangeName(s) {
        var r = s && (s.VideoRangeType || s.VideoRange);
        if (!r || r === 'SDR' || r === 'Unknown') {
            return '';
        }
        if (r.indexOf('DOVI') === 0) return 'Dolby Vision';
        if (r === 'HDR10Plus') return 'HDR10+';
        if (r === 'HDR') return 'HDR';
        return r;
    }

    function bitrateText(bps) {
        if (!bps || bps <= 0) {
            return '';
        }
        var l = document.documentElement.getAttribute('lang') || undefined;
        if (bps >= 1000000) {
            return (bps / 1000000).toLocaleString(l, { maximumFractionDigits: bps >= 10000000 ? 0 : 1 }) + ' Mbit/s';
        }
        return Math.round(bps / 1000).toLocaleString(l) + ' kbit/s';
    }

    function channelsText(n) {
        if (!n) return '';
        if (n === 1) return 'Mono';
        if (n === 2) return 'Stereo';
        if (n === 6) return '5.1';
        if (n === 8) return '7.1';
        return n + 'ch';
    }

    function videoDesc(res, codec, bitDepth, hdr) {
        var parts = [res];
        if (cfg.showCodec && codec) {
            parts.push(codec + (bitDepth && bitDepth > 8 ? ' ' + bitDepth + '-bit' : ''));
        }
        if (cfg.showHdr && hdr) {
            parts.push(hdr);
        }
        return parts.filter(Boolean).join(' ');
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function toArray(reasons) {
        if (!reasons) return [];
        if (Array.isArray(reasons)) return reasons;
        return String(reasons).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    // ------------------------------------------------------------------ data
    function apiClient() {
        var c = window.ApiClient;
        return c && typeof c.getCurrentUserId === 'function' && c.getCurrentUserId() ? c : null;
    }

    var itemCache = {};
    var itemCacheKeys = [];

    function getItem(c, id) {
        if (itemCache[id]) {
            return itemCache[id];
        }
        var p = Promise.resolve(c.getItem(c.getCurrentUserId(), id)).catch(function () {
            delete itemCache[id];
            return null;
        });
        itemCache[id] = p;
        itemCacheKeys.push(id);
        if (itemCacheKeys.length > ITEM_CACHE_MAX) {
            delete itemCache[itemCacheKeys.shift()];
        }
        return p;
    }

    // Item id and media source id of the stream the <video> element is playing, read from
    // its URL (direct play: /Videos/{id}/stream...; HLS without MSE: /videos/{id}/master.m3u8).
    // With hls.js the source is a blob: URL and both stay null.
    function srcInfo(video) {
        var src = (video && (video.currentSrc || video.src)) || '';
        var m = /\/videos\/([0-9a-f]{32}|[0-9a-f-]{36})\//i.exec(src);
        var ms = /[?&]mediaSourceId=([^&#]+)/i.exec(src);
        return {
            src: src,
            itemId: m ? m[1].replace(/-/g, '').toLowerCase() : null,
            mediaSourceId: ms ? decodeURIComponent(ms[1]).replace(/-/g, '').toLowerCase() : null
        };
    }

    function normId(id) {
        return id ? String(id).replace(/-/g, '').toLowerCase() : '';
    }

    function getOwnSession(c, info) {
        var deviceId = typeof c.deviceId === 'function' ? c.deviceId() : null;
        var url = c.getUrl('Sessions', deviceId ? { deviceId: deviceId } : {});
        return Promise.resolve(c.ajax({ type: 'GET', url: url, dataType: 'json' })).then(function (sessions) {
            sessions = sessions || [];
            var mine = sessions.filter(function (s) {
                return s.NowPlayingItem && (!deviceId || s.DeviceId === deviceId);
            });
            if (info.itemId) {
                // Only trust a session that reports the very item the player is playing;
                // right after a switch the server may still report the previous one.
                mine = mine.filter(function (s) { return normId(s.NowPlayingItem.Id) === info.itemId; });
            }
            return mine[0] || null;
        });
    }

    function pickSource(item, mediaSourceId) {
        var sources = (item && item.MediaSources) || [];
        var wanted = normId(mediaSourceId);
        for (var i = 0; i < sources.length; i++) {
            if (wanted && normId(sources[i].Id) === wanted) return sources[i];
        }
        return sources[0] || null;
    }

    function pickStream(source, type, index) {
        var streams = (source && source.MediaStreams) || [];
        var first = null;
        var def = null;
        for (var i = 0; i < streams.length; i++) {
            var s = streams[i];
            if (s.Type !== type) continue;
            if (index != null && index >= 0 && s.Index === index) return s;
            if (!first) first = s;
            if (s.IsDefault && !def) def = s;
        }
        return def || first;
    }

    // Builds the view model from the session (what the server delivers) and the
    // item's media source (what the file contains).
    function buildModel(session, item, video, info) {
        var ps = session.PlayState || {};
        var ti = session.TranscodingInfo || null;
        var source = pickSource(item, (info && info.mediaSourceId) || ps.MediaSourceId);
        var vs = pickStream(source, 'Video', null);
        var as = pickStream(source, 'Audio', ps.AudioStreamIndex);

        var srcW = (vs && vs.Width) || (video && video.videoWidth) || 0;
        var srcH = (vs && vs.Height) || (video && video.videoHeight) || 0;
        var srcVideo = videoDesc(resolutionName(srcW, srcH), codecName(vs && vs.Codec), vs && vs.BitDepth, rangeName(vs));
        var srcBitrate = (source && source.Bitrate) || (vs && vs.BitRate) || 0;
        var srcAudio = as ? [codecName(as.Codec), channelsText(as.Channels)].filter(Boolean).join(' ') : '';

        var m = {
            method: 'DirectPlay',
            audioOnly: false,
            primary: srcVideo,
            source: '',
            bitrate: srcBitrate,
            audio: srcAudio,
            reasons: [],
            tooltip: []
        };

        var playMethod = ps.PlayMethod || (ti ? 'Transcode' : 'DirectPlay');
        if (playMethod === 'DirectStream') {
            m.method = 'DirectStream';
        } else if (playMethod === 'Transcode' && ti) {
            var videoDirect = !!ti.IsVideoDirect;
            var audioDirect = !!ti.IsAudioDirect;
            m.reasons = toArray(ti.TranscodeReasons);
            if (videoDirect && audioDirect) {
                // Remux only: streams are copied into a new container.
                m.method = 'DirectStream';
            } else {
                m.method = 'Transcode';
                m.audioOnly = videoDirect && !audioDirect;
                if (!videoDirect) {
                    var outW = ti.Width || (video && video.videoWidth) || 0;
                    var outH = ti.Height || (video && video.videoHeight) || 0;
                    m.primary = videoDesc(resolutionName(outW, outH), codecName(ti.VideoCodec), null, '');
                    if (cfg.showSource && srcVideo && srcVideo !== m.primary) {
                        m.source = srcVideo;
                    }
                }
                if (!audioDirect && ti.AudioCodec) {
                    var outAudio = [codecName(ti.AudioCodec), channelsText(ti.AudioChannels)].filter(Boolean).join(' ');
                    m.audio = cfg.showSource && srcAudio && srcAudio !== outAudio ? srcAudio + ' → ' + outAudio : outAudio;
                }
                // TranscodingInfo.Bitrate is the server's target/maximum. When the video is
                // only copied, the stream carries roughly the source bitrate, so keep that.
                if (ti.Bitrate && !videoDirect) {
                    m.bitrate = ti.Bitrate;
                }
            }
        } else if (playMethod === 'Transcode') {
            m.method = 'Transcode';
        }

        // Tooltip with everything, for those who want the details.
        var tip = m.tooltip;
        tip.push(t('playMethod') + ': ' + methodLabel(m));
        if (source && source.Container) tip.push(t('container') + ': ' + source.Container);
        if (vs) {
            tip.push(t('source') + ' ' + t('video') + ': ' + [srcW && srcH ? srcW + '×' + srcH : '', codecName(vs.Codec), vs.Profile,
                vs.BitDepth ? vs.BitDepth + '-bit' : '', rangeName(vs), vs.RealFrameRate ? Math.round(vs.RealFrameRate * 100) / 100 + ' fps' : '',
                bitrateText(vs.BitRate)].filter(Boolean).join(', '));
        }
        if (as) {
            tip.push(t('source') + ' ' + t('audio') + ': ' + [codecName(as.Codec), channelsText(as.Channels), as.Language, bitrateText(as.BitRate)].filter(Boolean).join(', '));
        }
        if (srcBitrate) tip.push(t('source') + ' ' + t('bitrate') + ': ' + bitrateText(srcBitrate));
        if (ti && m.method !== 'DirectPlay') {
            tip.push(t('output') + ': ' + [ti.Container,
                ti.IsVideoDirect ? t('video') + ' direct' : [ti.Width && ti.Height ? ti.Width + '×' + ti.Height : '', codecName(ti.VideoCodec)].filter(Boolean).join(' '),
                ti.IsAudioDirect ? t('audio') + ' direct' : [codecName(ti.AudioCodec), channelsText(ti.AudioChannels)].filter(Boolean).join(' '),
                ti.Bitrate ? t('target') + ' ' + bitrateText(ti.Bitrate) : ''].filter(Boolean).join(', '));
            if (ti.HardwareAccelerationType && ti.HardwareAccelerationType !== 'none') {
                tip.push(t('hw') + ': ' + ti.HardwareAccelerationType);
            } else if (m.method === 'Transcode') {
                tip.push(t('hw') + ': ' + t('sw'));
            }
            if (ti.CompletionPercentage) {
                tip.push(t('progress') + ': ' + Math.round(ti.CompletionPercentage) + ' %');
            }
        }
        if (m.reasons.length) {
            tip.push(t('reasons') + ': ' + m.reasons.map(reasonText).join(', '));
        } else if (m.method === 'DirectPlay') {
            tip.push(t('directPlayHint'));
        } else if (m.method === 'DirectStream') {
            tip.push(t('directStreamHint'));
        }
        return m;
    }

    function methodLabel(m) {
        if (m.method === 'DirectPlay') return t('directPlay');
        if (m.method === 'DirectStream') return t('directStream');
        return t('transcode') + (m.audioOnly ? ' (' + t('audioOnly') + ')' : '');
    }

    function render(m) {
        var html = '';
        var items = [];
        var video = m.source ? esc(m.source) + ' <span class="pbiArrow" aria-hidden="true">→</span> ' + esc(m.primary) : esc(m.primary);
        if (video) items.push('<span class="pbiItem pbiVideo">' + video + '</span>');
        if (cfg.showAudio && m.audio) items.push('<span class="pbiItem pbiAudio">' + esc(m.audio) + '</span>');
        if (cfg.showBitrate && m.bitrate) items.push('<span class="pbiItem pbiBitrate">' + esc(bitrateText(m.bitrate)) + '</span>');
        var cls = m.method === 'Transcode' ? 'pbiMethod-transcode' : (m.method === 'DirectStream' ? 'pbiMethod-directstream' : 'pbiMethod-directplay');
        items.push('<span class="pbiItem pbiMethod ' + cls + '">' + esc(methodLabel(m)) + '</span>');
        if (cfg.showReasons && m.reasons.length && m.method === 'Transcode') {
            items.push('<span class="pbiItem pbiReasons">' + esc(m.reasons.map(reasonText).join(', ')) + '</span>');
        }
        html = items.join('');
        return html;
    }

    // ------------------------------------------------------------------ OSD
    var BUSY_TIMEOUT_MS = 15000;

    var state = {
        el: null,
        lastFetch: 0,
        busy: false,
        busySince: 0,
        generation: 0,
        visible: false,
        src: '',
        html: ''
    };

    // jellyfin-web can keep an older, hidden #videoOsdPage in the DOM next to the active
    // one (duplicate ids), so getElementById may return the stale page. Use the visible one.
    function findOsd() {
        var pages = document.querySelectorAll('[id="videoOsdPage"]');
        for (var i = pages.length - 1; i >= 0; i--) {
            var page = pages[i];
            if (!page.classList.contains('hide') && page.getClientRects().length > 0) {
                return page.querySelector('.videoOsdBottom-maincontrols');
            }
        }
        return null;
    }

    function findVideo() {
        var videos = document.querySelectorAll('.videoPlayerContainer video, video.htmlvideoplayer');
        for (var i = videos.length - 1; i >= 0; i--) {
            if (videos[i].getClientRects().length > 0) return videos[i];
        }
        return videos[videos.length - 1] || null;
    }

    // Forget everything shown so far: a different video (or player page) is active.
    function reset() {
        state.generation++;
        state.busy = false;
        state.lastFetch = 0;
        state.html = '';
        if (state.el) {
            state.el.classList.add('hide');
            state.el.innerHTML = '';
            state.el.title = '';
        }
    }

    function osdVisible(osd) {
        // The OSD is position: fixed, so offsetParent is always null; use the layout boxes instead.
        return !!osd && !osd.classList.contains('videoOsdBottom-hidden') && !osd.classList.contains('hide') && osd.getClientRects().length > 0;
    }

    function ensureLine(osd) {
        if (state.el && osd.contains(state.el)) {
            return state.el;
        }
        if (state.el && state.el.parentNode) {
            // Line from an older player page: remove it, so it can never show stale data.
            state.el.parentNode.removeChild(state.el);
        }
        var el = document.createElement('div');
        // Deliberately not jellyfin-web's osdTextContainer: themes restyle or hide that class.
        el.className = 'pbiOsd hide';
        el.setAttribute('aria-live', 'off');
        var anchor = osd.querySelector('.osdSecondaryMediaInfo') || osd.querySelector('.osdMainTextContainer');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(el, anchor.nextSibling);
        } else {
            var controls = osd.querySelector('.osdControls') || osd;
            controls.insertBefore(el, controls.firstChild);
        }
        state.el = el;
        state.html = '';
        return el;
    }

    function refresh(osd) {
        var c = apiClient();
        if (!c) {
            return;
        }
        if (state.busy && Date.now() - state.busySince < BUSY_TIMEOUT_MS) {
            return;
        }
        var gen = ++state.generation;
        state.busy = true;
        state.busySince = Date.now();
        state.lastFetch = Date.now();
        var video = findVideo();
        var info = srcInfo(video);
        getOwnSession(c, info).then(function (session) {
            if (!session) {
                return null;
            }
            return getItem(c, session.NowPlayingItem.Id).then(function (item) {
                return buildModel(session, item, video, info);
            });
        }).then(function (m) {
            if (gen !== state.generation) {
                return; // outdated answer (video changed meanwhile)
            }
            var el = ensureLine(osd);
            if (!m) {
                el.classList.add('hide');
                return;
            }
            var html = render(m);
            if (html !== state.html) {
                el.innerHTML = html;
                state.html = html;
            }
            el.title = m.tooltip.join('\n');
            el.classList.remove('hide');
            alignToTimeline(osd);
        }).catch(function (e) {
            console.warn('PlaybackInfo: could not load playback info', e);
        }).then(function () {
            if (gen === state.generation) {
                state.busy = false;
            }
        });
    }

    // Indent the line so it starts flush with the timeline. The time text left of the
    // timeline grows (0:05 → 1:23:45), so this is re-measured on every tick.
    function alignToTimeline(osd) {
        var el = state.el;
        if (!el || !osd.contains(el)) {
            return;
        }
        var slider = osd.querySelector('.osdPositionSlider') || osd.querySelector('.sliderContainer');
        if (!slider) {
            return;
        }
        var s = slider.getBoundingClientRect();
        var e = el.getBoundingClientRect(); // border box: its left edge does not move with padding
        if (!s.width || !e.width) {
            return; // not laid out (hidden); keep the last value
        }
        var indent = Math.max(0, Math.round(s.left - e.left));
        var value = indent ? indent + 'px' : '';
        if (el.style.paddingLeft !== value) {
            el.style.paddingLeft = value;
        }
    }

    function tick() {
        var osd = findOsd();
        if (!osd) {
            if (state.src) {
                state.src = '';
                reset();
            }
            state.visible = false;
            return;
        }
        if (state.el && !osd.contains(state.el)) {
            reset();
            ensureLine(osd);
        }
        var video = findVideo();
        var src = (video && (video.currentSrc || video.src)) || '';
        if (src !== state.src) {
            state.src = src;
            reset();
        }
        var visible = osdVisible(osd);
        var becameVisible = visible && !state.visible;
        state.visible = visible;
        if (!visible) {
            return;
        }
        alignToTimeline(osd);
        var age = Date.now() - state.lastFetch;
        if ((becameVisible && age > 1500) || age >= REFRESH_MS) {
            refresh(osd);
        }
    }

    setInterval(tick, TICK_MS);

    window.PlaybackInfoOsd = {
        loaded: true,
        config: cfg,
        refresh: function () {
            var osd = findOsd();
            if (osd) refresh(osd);
        }
    };
})();
