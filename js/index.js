const ipc = require('electron').ipcRenderer;
const remote = require('electron').remote;
const dialog = remote.dialog;
const shell = require('electron').shell;
const appData = require('./package.json');
const userAgent = {
    desktop: 'bilimini Desktop like Mozilla/233 (Chrome and Safari)',
    mobile: 'bilimini Mobile like (iPhone or Android) whatever'
};
const videoUrlPrefix = 'http://bilibili.com/video/av';
const videoUrlPattern = /video\/av(\d+(?:\/index_\d+\.html)?(?:\/#page=\d+)?)/;
const bangumiUrl = (aid, pid) => `http://bangumi.bilibili.com/anime/${aid}/play#${pid}`;
const bangumiUrlPattern = /bangumi\/i\/(\d+)/;
let wv, wrapper;

// 保存用户设置
var Config = {
    load: function(key) {
        var value = JSON.parse(localStorage.getItem(key));
        if( value != null ) {
            Config[key] = value;
        }
        return value;
    },
    set: function(key, value) {
        if( typeof key == 'object' ) {
            for( let _k of key ) {
                window.localStorage.setItem(_k, JSON.stringify(key[_k]));
            }
        } else if( typeof key == 'string' && value ) {
            window.localStorage.setItem(key, JSON.stringify(value));
        }
    },
    'windowSizeMini': [300, 187],
    'windowSizeDefault': [375, 500]
};

// 初始化时读取用户设置
function loadUserConfig() {
    // 读取用户拖的视频播放窗口尺寸
    Config.load('windowSizeMini');
}

// 保存用户浏览记录
var _history = {
    stack: ['http://m.bilibili.com/index.html'], 
    pos: 0,
    go: function(target, noNewHistory) {
        let m;
        if (m = videoUrlPattern.exec(target)) {
            // case 1 普通视频播放页，转跳对应pc页
            wv.loadURL(videoUrlPrefix + m[1], {
                userAgent: userAgent.desktop
            });
            !noNewHistory && _history.add(videoUrlPrefix + m[1]);
        } else if(m = bangumiUrlPattern.exec(target)) {
            // case 2 番剧，转跳对应pc页
            let url = bangumiUrl(m[1]);
            wv.loadURL(url, {
                userAgent: userAgent.desktop
            });
            // 因为番剧页最终目标是/blackboard/html5player.html，这里获取到的url只是中间步骤，
            // 所以就不加到history里了
        } else {
            // 其他链接不做操作直接打开
            wv.loadURL(target, {
                userAgent: userAgent.mobile
            });
            !noNewHistory && _history.add(target);
        }
    },
    add: function(url) {
        // 丢掉当前位置往后的history
        _history.stack.length = _history.pos + 1;
        _history.stack.push(url);
        _history.pos++;
    },
    goBack: function() {
        if( !_history.canGoBack() ) {
            return false;
        }
        _history.go(_history.stack[--_history.pos], true);
    },
    goForward: function() {
        if( !_history.canGoForward() ) {
            return false;
        }
        _history.go(_history.stack[++_history.pos], true);
    },
    canGoBack: function() {
        return _history.pos > 0;
    },
    canGoForward: function() {
        return _history.pos + 1 < _history.stack.length;
    }
};

// UI逻辑
const v = new Vue({
    el: '#wrapper',
    data: {
        naviGotoTarget: '',
        naviGotoInputShow: false,
        naviCanGoBack: false,
        naviCanGoForward: false,
        showNaviGotoOverlay: false,
        showAboutOverlay: false
    },
    methods: {
        // 后退
        naviBack: function() {
            _history.goBack();
        },
        // 前进
        naviForward: function() {
            _history.goForward();
        },
        // 通过url或av号跳转
        naviGotoShow: function() {
            this.naviGotoTarget = '';
            this.naviGotoInputShow = true;
            this.showNaviGotoOverlay = true;
        },
        naviGotoHide: function() {
            this.naviGotoInputShow = this.showNaviGotoOverlay = false;
        },
        naviGoto: function() {
            var target = this.naviGotoTarget;
            // 包含bilibili.com的字符串和纯数字是合法的跳转目标
            if (target.startsWith('http') && target.indexOf('bilibili.com') > -1) {
                _history.go(target);
                this.naviGotoHide();
            } else if (/^(\d+)$/.test(target)) {
                _history.go(videoUrlPrefix + target);
                this.naviGotoHide();
            } else {
                // not a valid input
                alert('你确定输入的是b站链接或者av号吗？');
            }
        },
        // 关于
        showAbout: function() {
            this.showAboutOverlay = true;
            wrapper.classList.add('showAbout');
        },
        hideAbout: function() {
            this.showAboutOverlay = false;
            wrapper.classList.remove('showAbout');
        },
        // 关鸡
        turnOff: function() {
            remote.getCurrentWindow().close();
        },
        // 显示、隐藏弹幕快捷键
        // pull request #1. Thanks to bumaociyuan
        toggleDanmaku: function() {
            wv.executeJavaScript(`document.getElementsByName('ctlbar_danmuku_on').length`, function(result) {
                let isDanmakuOn = result == 1;
                if (isDanmakuOn) {
                    wv.executeJavaScript(`document.querySelector('.bilibili-player-iconfont-danmaku-off').click()`)
                } else {
                    wv.executeJavaScript(`document.querySelector('.bilibili-player-iconfont-danmaku').click()`)
                }
            });
        }
    }
});

// 检查更新
function checkUpdateOnInit() {
    var r = new XMLHttpRequest();
    r.open("GET", "http://rakuen.thec.me/bilimini/beacon", true);
    r.onreadystatechange = function () {
        if (r.readyState != 4 || r.status != 200) return;
        var data = JSON.parse(r.responseText);
        // 提示更新
        if( data.version != appData.version ) {
            dialog.showMessageBox(null, {
                buttons: ['取消', '去下载'],
                message: `检查到新版本v${data.version}，您正在使用的版本是v${appData.version}，是否打开下载页面？`
            }, (res, checkboxChecked) => {
                if( res == 1 ) {
                    shell.openExternal(`https://pan.baidu.com/s/1jIHnRk6#list/path=%2Fbilimini%2Fv${data.version}`);
                }
            });
        }
        // 显示额外的公告
        if( data.announcement != '' && !localStorage.getItem(data.announcement) ) {
            dialog.showMessageBox(null, {
                buttons: ['了解'],
                message: data.announcement
            }, () => {
                localStorage.setItem(data.announcement, 1);
            });
        }
    };
    r.send();
}

// 给body加上platform flag
function detectPlatform() {
    if (process.platform.startsWith('win')) {
        window.platform = 'win';
        document.body.classList.add('win');
    } else if (process.platform == 'darwin') {
        window.platform = 'darwin';
        document.body.classList.add('macos');
    }
}

// 当用户拖拽窗口时保存窗口尺寸
function saveWindowSizeOnResize() {
    var saveWindowSizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(saveWindowSizeTimer);
        saveWindowSizeTimer = setTimeout(function() {
            // 暂时只保存视频播放页的尺寸
            if( currentWindowType == 'windowSizeMini' ) {
                Config[currentWindowType] = [window.innerWidth, window.innerHeight];
                Config.set(currentWindowType, [window.innerWidth, window.innerHeight]);
            }
        }, 600);
    });
}

// 根据用户访问的url决定app窗口尺寸
var currentWindowType = 'default';
function resizeWindowOnNavigation() {
    wv.addEventListener('did-finish-load', function() {
        let targetWindowType, url = wv.getURL();
        if (url.indexOf('video/av') > -1 || url.indexOf('html5player.html') > -1) {
            targetWindowType = 'windowSizeMini';
        } else {
            targetWindowType = 'windowSizeDefault';
        }
        if (targetWindowType != currentWindowType) {
            let mw = remote.getCurrentWindow(),
                currentSize = mw.getSize(),
                leftTopPosition = mw.getPosition(),
                rightBottomPosition = [leftTopPosition[0] + currentSize[0], leftTopPosition[1] + currentSize[1]],
                targetSize = (targetWindowType in Config) ? Config[targetWindowType] : Config.windowSizeDefault,
                targetPosition = [rightBottomPosition[0] - targetSize[0], rightBottomPosition[1] - targetSize[1]];

            mw.setBounds({
                x: targetPosition[0],
                y: targetPosition[1],
                width: targetSize[0],
                height: targetSize[1]
            }, true);

            currentWindowType = targetWindowType;
        }
    });
}

// 判断是否能前进/后退
function checkGoBackAndForwardStateOnNavigation() {
    wv.addEventListener('did-finish-load', function() {
        v.naviCanGoBack = _history.canGoBack();
        v.naviCanGoForward = _history.canGoForward();
    });
}

// 当用户点到视频播放页时跳到桌面版页面，桌面版的h5播放器弹幕效果清晰一点
function switchDesktopOnNavigationToVideoPage() {
    wv.addEventListener('will-navigate', function(e) {
       _history.go(e.url);
    });
}

// windows下frameless window没法正确检测到mouseout事件，只能根据光标位置做个dirtyCheck了
function initMouseStateDirtyCheck() {
    // 从 https://github.com/chitosai/bilimini/issues/10 的反馈来看linux下也无法用css触发hover，
    // 所以目前除了mac其他系统都开启dirtycheck
    if (platform == 'darwin') {
        return false;
    }
    var getMousePosition = remote.screen.getCursorScreenPoint,
        mw = remote.getCurrentWindow();
    setInterval(function() {
        let mousePos = getMousePosition(),
            windowPos = mw.getPosition(),
            windowSize = mw.getSize();
        if ((mousePos.x > windowPos[0]) && (mousePos.x < windowPos[0] + windowSize[0]) &&
            (mousePos.y > windowPos[1]) && (mousePos.y < windowPos[1] + windowSize[1])) {
            wrapper.classList.add('showTopBar');
        } else {
            wrapper.classList.remove('showTopBar');
        }
    }, 300);
}

// 点击菜单「webview console」时打开webview
function openWebviewConsoleOnMenuClick() {
    ipc.on('openWebviewDevTools', () => {
        wv.openDevTools();
    });
}

// webview中点击target="_blank"的链接时在当前webview打开
function redirectWhenOpenUrlInNewTab() {
    wv.addEventListener('new-window', function(ev) {
        _history.go(ev.url);
    });
}

window.addEventListener('DOMContentLoaded', function() {
    wrapper = document.getElementById('wrapper');
    wv = document.getElementById('wv');
    checkUpdateOnInit();
    loadUserConfig();
    detectPlatform();
    resizeWindowOnNavigation();
    saveWindowSizeOnResize();
    checkGoBackAndForwardStateOnNavigation();
    switchDesktopOnNavigationToVideoPage();
    initMouseStateDirtyCheck();
    openWebviewConsoleOnMenuClick();
    redirectWhenOpenUrlInNewTab();
});
