var _curr_tab_id = null;
var _popup_tab_id = null;


// We need to collect the internal frameId and parentFrameId for
// each <iframe> so that when we try to reassemble the complete
// DOM tree across iframes, we can associate the contents of the
// frames (which we get along with a frameId) with the <iframes>
// we encounter during a DOM traversal.

/*
function onBeforeRequest (details) {
    var gatherFrameId = function (frameId, parentFrameId) {
        var d = document.documentElement;
        console.log ("recording frame id " + frameId + " for document:");
        console.log (d);
        d.setAttribute('data-rabbithole-frameid', frameId);
        d.setAttribute('data-rabbithole-parentframeid', parentFrameId);
    };
    var script = '(' + gatherFrameId.toString() + ')(' + details.frameId + ', ' + details.parentFrameId + ')';

    var url = 'data:text/javascript;base64,' + btoa(script);

    return {redirectUrl: url};
};

function gather_frame_ids () {
    console.log ("[gather_frame_ids]");
    var url_pattern = chrome.runtime.getURL('getFrameId') + '*';

    console.log ("[gather_frame_ids] adding listener to url requests matching '" + url_pattern + "'");

    chrome.webRequest.onBeforeRequest.addListener (onBeforeRequest,
        {urls: [ url_pattern ]}, ['blocking']);
};
*/

// When the browser-action button is clicked...
chrome.browserAction.onClicked.addListener(function() {
    chrome.tabs.query ({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs[0];
        _curr_tab_id = tab.id;

        chrome.windows.create({
            url: 'popup.html',
            type: 'panel',
            width: 800,
            height: 650
        },
        function (window) {
            _popup_tab_id = window.tabs[0].id;
            /*
            window.contentWindow.addEventListener('load', function () {
                console.log ("sending 'start' message to popup...");
                chrome.tabs.sendMessage(_popup_tab_id, { text: 'start', tab_id: _curr_tab_id });
            });
            */
            setTimeout (function () {
                console.log ("sending 'start' message to popup...");
                chrome.tabs.sendMessage(_popup_tab_id, { text: 'start', tab_id: _curr_tab_id });
            }, 3000)
        });
    });
});

//gather_frame_ids ();
