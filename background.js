var _curr_tab_id = null;
var _popup_tab_id = null;

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
            start ();
            _popup_tab_id = window.tabs[0].id;
        });
    });
});

function on_content_script_executed ()
{
    chrome.tabs.sendMessage(_popup_tab_id, { text: 'start', tab_id: _curr_tab_id });
}

function start ()
{
    console.log ("injecting code into frames...");
    chrome.tabs.executeScript(_curr_tab_id, {
        file: "content.js",
        allFrames: true
        }, on_content_script_executed);

    // D'oh -- calling executeScript with allFrames doesn't call the callback!
    setTimeout (on_content_script_executed, 3000);
}
