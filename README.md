# Down the Rabbit Hole
Chrome Extension for publishers to investigate third-party ads

As a publisher on the web today, you may have a love-hate relationship with ad networks.  On one hand, those ad networks help to pay the bills.  But on the other hand, their questionable coding abilities, poor security, and dubious business practices expose you to all sorts of problems.

Our team has spent countless hours dissecting the DOM to try to track down offending ads.  This is tedious work, especially when an ad call gets bounced from network to network, creating an extremely complex DOM of nested IFRAMEs.

*Down the Rabbit Hole* is designed to stremaline this process.  Using a CSS selector provided by you, it identifies the top-level DOM elements for your ad units.  It then recursively descends those elements, building a simpler object model for you to analyze.

* simplifies the identification and interpretation of the ad-related portion of the DOM
* "compresses" the tree by skipping past DOM elements that aren't really important and only tracking select properties
* makes off-site objects easily identifiable
* tries to identify pixel trackers
* tries to identify the DOM elements that are most likely the ad creative itself
* attempts to keep track of a "network path" so you can see the whole ad chain where ads are coming from; this is a work in progress
* computes statistics like the number of scripts and iframes loaded beneath each node in the tree

## Configuration

In order for DTRH to work with your site, you need to give it a CSS selector that will capture all the top-level DOM elements of your ad units (and is specific enough to *not* capture non-ad-unit elements).

For example, if you look at the ad tags on http://slashdot.org/, you will see that they all have IDs like `div-gpt-ad-728x90_a` and `div-gpt-ad-300x250_a`.  You can capture them all with a selector like

    [id*='div-gpt-ad']
    
Once you have your selector, use the options dialog to configure DTRH.  You can open it either from the extensions page in chrome, or by clicking on the gear icon in the DTRH popup window.  If you have a DTRH window open when you change the CSS selector, you'll need to close DTRH and reopen it to get it to rescan your page's DOM.

## Installing from source

If you enable developer mode in chrome's extension manager, you can "load unpacked extension".  Just point chrome at the rabbithole directory.

## Notes

The code is interesting on a few levels:

### Iframe traversal

DTRH builds a single unified tree representing your page's DOM along with all nested IFRAMEs' DOMs, including those from other domains.  Javascript running within a page cannot access the DOM of an iframe from another origin.  A chrome extension can get around this limitation by injecting a script into the page and all iframes.  It can then pass a message to the frames and gather information from all of the frames via callbacks, and then merging the sub-trees into the main tree.

### Message passing

Rather than sending one message to all frames, it sends an individual message to each individual frame; this is important, because if we sent one message to all frames, we would only be able to process one callback (the first one that happens to be called by one of the frames).

### Standalone window

I originally started with the DTRH UI inside of a regular extension popup.  The problem with that is that you can't move the popup, so it can be hard to see the ads in your page as you are inspecting them.  In order to create a standalone window that could be moved, I changed the code to use an event page instead of a default_popup.  When the user clicks the extension button, we inject the code into the frames from background.js (we can't do it in popup.js), then we send a message to the newly created window to have it begin messaging the frames and gathering the data.

