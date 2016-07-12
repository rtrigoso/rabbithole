// Saves options to chrome.storage
function save_options ()
{
    console.log ('saving');
    var css_selector = document.getElementById ('css_selector').value;

    console.log ('css_selector: ' + css_selector);
    chrome.storage.sync.set ({
        css_selector: css_selector
    }, function ()
    {
        // Update status to let user know options were saved.
        var status = document.getElementById ('status');
        status.textContent = 'Options saved.';
        setTimeout (function ()
        {
            status.textContent = '';
        }, 750);
    });
    console.log ('saved options');
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options ()
{
    chrome.storage.sync.get ({
        css_selector: "[id*='my-ad-idbase-']"
    }, function (items)
    {
        document.getElementById ('css_selector').value = items.css_selector;
    });
}

console.log ('adding event listeners...');
document.addEventListener ('DOMContentLoaded', restore_options);
document.getElementById ('save').addEventListener ('click', save_options);
