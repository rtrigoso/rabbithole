
// When the browser-action button is clicked...
chrome.browserAction.onClicked.addListener (function ()
{
    chrome.tabs.query ({active: true, currentWindow: true}, function (tabs)
    {
        // get the current tab, which popup.js will retrieve from us via
        // chrome.extension.getBackgroundPage(); it seems to be pretty
        // hard to query for it from the popup.js, since the popup window
        // itself seems to become the current window...
        var tab = tabs[0];
        window.curr_tab_id = tab.id;

        chrome.windows.create ({
                url: 'popup.html',
                type: 'panel',
                width: 800,
                height: 622
            },
            function (window)
            {
            });
    });

});

var _num_pending_scans = 0;

function message_received (request, sender, sendResponse)
{
    if (!sender.tab)
    {
        return;
    }

    var action = request.action;

    console.log ("received message '" + action + "' from content script running with URL " + sender.tab.url);

    if (action == 'scan_frame')
    {
        _num_pending_scans++;
        sendResponse({ num_pending_scans: _num_pending_scans });
    }

    if (action == 'frame_scanned')
    {
        _num_pending_scans--;
        sendResponse({ num_pending_scans: _num_pending_scans });
    }

    if (action == 'get_num_pending_scans')
    {
        sendResponse({ num_pending_scans: _num_pending_scans });
    }

    if (action == 'reset_pending_scans')
    {
        _num_pending_scans = 0;
        sendResponse({ num_pending_scans: _num_pending_scans });
    }
}


chrome.runtime.onMessage.addListener(message_received);
