// JavaScript

"use strict";


// button
document.getElementById('fetch').addEventListener("click", function (event) {
    showSynonymsOf(document.getElementById('word').value);
});

// text field
document.getElementById('word').addEventListener("change", function (event) {
    showSynonymsOf(document.getElementById('word').value);
});

// click on synonyms
document.getElementById('synonyms_list').addEventListener("click", function (xEvent) {
    let xElem = xEvent.target;
    if (xElem.className == "synonym") {
        showSynonymsOf(xElem.textContent);
    }
});


function createNode (sType, oAttr, oDataset=null) {
    try {
        let xNode = document.createElement(sType);
        Object.assign(xNode, oAttr);
        if (oDataset) {
            Object.assign(xNode.dataset, oDataset);
        }
        return xNode;
    }
    catch (e) {
        showError(e);
    }
}


function showSynonymsOf (sWord) {
    try {
        sWord = sWord.trim().toLowerCase().replace(/’/g, "'").replace(/  +/g, " ");
        if (sWord) {
        	document.getElementById('word_title').textContent = sWord;
        	let lSyns = thesaurus.getSyns(sWord);
            if (lSyns.length == 0) {
                document.getElementById('word').style = "color: #BB4411;";
                emptyList();
                document.getElementById('synonyms_list').textContent = "Aucun synonyme trouvé.";
            } else {
                document.getElementById('word').style = "";
                document.getElementById('word').value = "";
                emptyList();
                populateList(lSyns);
            }
        }
    }
    catch (e) {
        console.error(e.fileName + "\n" + e.name + "\nline: " + e.lineNumber + "\n" + e.message);
    }
}


function populateList (lSyns) {
    let xSynonymsList = document.getElementById('synonyms_list');
    for (let [sCat, lSyn] of lSyns) {
        let xSynBlok = createNode("div", {className: "syn_block"});
        xSynonymsList.appendChild(xSynBlok);
        xSynBlok.appendChild(createNode("div", { className: "cat_name", textContent: sCat}));
        let xSynonyms = createNode("div", { className: "synonyms" });
        xSynBlok.appendChild(xSynonyms);
        for (let sSyn of lSyn) {
            xSynonyms.appendChild(createNode("div", { className: "synonym", textContent: sSyn }));
        }
    }
}


function emptyList () {
    let xSynonymsList = document.getElementById('synonyms_list');
    while (xSynonymsList.firstChild) {
        xSynonymsList.removeChild(xSynonymsList.firstChild);
    }
}


showSynonymsOf("être");

document.getElementById("word").focus();
