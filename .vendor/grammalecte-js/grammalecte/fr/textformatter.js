// Grammalecte - text formatter

/* jshint esversion:6, -W097 */
/* jslint esversion:6 */
/* global exports, console */

"use strict";

//!
// Map
/*jslint esversion: 6*/

if (Map.prototype.grammalecte === undefined) {
    Map.prototype.gl_shallowCopy = function () {
        let oNewMap = new Map();
        for (let [key, val] of this.entries()) {
            oNewMap.set(key, val);
        }
        return oNewMap;
    };

    Map.prototype.gl_get = function (key, defaultValue) {
        let res = this.get(key);
        if (res !== undefined) {
            return res;
        }
        return defaultValue;
    };

    Map.prototype.gl_toString = function () {
        // Default .toString() gives nothing useful
        let sRes = "{ ";
        for (let [k, v] of this.entries()) {
            sRes += (typeof k === "string") ? '"' + k + '": ' : k.toString() + ": ";
            sRes += (typeof v === "string") ? '"' + v + '", ' : v.toString() + ", ";
        }
        sRes = sRes.slice(0, -2) + " }";
        return sRes;
    };

    Map.prototype.gl_update = function (dDict) {
        for (let [k, v] of dDict.entries()) {
            this.set(k, v);
        }
    };

    Map.prototype.gl_updateOnlyExistingKeys = function (dDict) {
        for (let [k, v] of dDict.entries()) {
            if (this.has(k)){
                this.set(k, v);
            }
        }
    };

    Map.prototype.gl_reverse = function () {
        let dNewMap = new Map();
        this.forEach((val, key) => {
            dNewMap.set(val, key);
        });
        return dNewMap;
    };

    Map.prototype.grammalecte = true;
}



// Latin letters: http://unicode-table.com/fr/
// 0-9
// A-Z
// a-z
// À-Ö     00C0-00D6   (upper case)
// Ø-ß     00D8-00DF   (upper case)
// à-ö     00E0-00F6   (lower case)
// ø-ÿ     00F8-00FF   (lower case)
// Ā-ʯ     0100-02AF   (mixed)
// -> a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ

// JS sucks: $0 is not recognized (why?), use $&

const oReplTable = {
    //// surnumerary_spaces
    "start_of_paragraph":         [ [/^[  ]+/gm, ""] ],
    "end_of_paragraph":           [ [/[  ]+$/gm, ""] ],
    "between_words":              [ [/  |  /g, " "],  // espace + espace insécable -> espace
                                    [/  +/g, " "],    // espaces surnuméraires
                                    [/  +/g, " "] ],  // espaces insécables surnuméraires
    "before_punctuation":         [ [/ +(?=[.,…])/g, ""] ],
    "within_parenthesis":         [ [/\([  ]+/g, "("],
                                    [/[  ]+\)/g, ")"] ],
    "within_square_brackets":     [ [/\[[  ]+/g, "["],
                                    [/[  ]+\]/g, "]"] ],
    "within_quotation_marks":     [ [/“[  ]+/g, "“"],
                                    [/[  ]”/g, "”"] ],
    //// non-breaking spaces
    // espaces insécables
    "nbsp_before_punctuation":    [ [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…)»}\]])([:;?!])[   ]/g, "$1 $2 "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…)»}\]])([:;?!])$/g, "$1 $2"],
                                    [/[  ]+([:;?!])/g, " $1"] ],
    "nbsp_within_quotation_marks":[ [/«([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])/g, "« $1"],
                                    [/«[  ]+/g, "« "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ.!?])»/g, "$1 »"],
                                    [/[  ]+»/g, " »"] ],
    "nbsp_within_numbers":        [ [/(\d)[  ](?=\d)/g, "$1 "] ],
    // espaces insécables fines
    "nnbsp_before_punctuation":   [ [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…\)»}\]])([;?!])[   ]/g, "$1 $2 "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…\)»}\]])([;?!])$/g, "$1 $2"],
                                    [/[  ]+([;?!])/g, " $1"],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…\)»}\]]):[   ]/g, "$1 : "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…\)»}\]]):$/g, "$1 :"],
                                    [/[  ]+:/g, " :"] ],
    "nnbsp_within_quotation_marks":[[/«([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])/g, "« $1"],
                                    [/«[  ]+/g, "« "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ.!?])»/g, "$1 »"],
                                    [/[  ]+»/g, " »"] ],
    "nnbsp_within_numbers":       [ [/(\d)[  ](\d)/g, "$1 $2"] ],
    // common
    "nbsp_titles":                [ [/\bM(mes?|ᵐᵉˢ?|grs?|ᵍʳˢ?|lles?|ˡˡᵉˢ?|rs?|ʳˢ?|M[.]) /g, "M$1 "],
                                    [/\bP(re?s?|ʳᵉ?ˢ?) /g, "P$1 "],
                                    [/\bD(re?s?|ʳᵉ?ˢ?) /g, "D$1 "],
                                    [/\bV(ves?|ᵛᵉˢ?) /g, "V$1 "] ],
    "nbsp_before_symbol":         [ [/(\d) ?([%‰€$£¥˚Ω℃])/g, "$1 $2"] ],
    "nbsp_before_units":          [ [/([0-9⁰¹²³⁴⁵⁶⁷⁸⁹]) ?([kcmµn]?(?:[slgJKΩ]|m[²³]?|Wh?|Hz|dB)|[%‰]|°C)\b/g, "$1 $2"] ],
    "nbsp_repair":                [ [/([\[(])[   ]([!?:;])/g, "$1$2"],
                                    [/(https?|ftp)[   ]:\/\//g, "$1://"],
                                    [/&([a-z]+)[   ];/g, "&$1;"],
                                    [/&#([0-9]+|x[0-9a-fA-F]+)[   ];/g, "&#$1;"] ],
    //// missing spaces
    "add_space_after_punctuation":[ [/[;!…](?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])/g, "$& "],
                                    [/[?](?=[A-ZÀ-ÖØ-ßĀ-ʯ])/g, "? "],
                                    [/\.(?=[A-ZÀ-ÖØ-ßĀ-ʯ][a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])/g, ". "],
                                    [/\.(?=À)/g, ". "],
                                    [/[,:](?=[a-zA-Zà-öÀ-Öø-ÿØ-ßĀ-ʯ])/g, "$& "],
                                    [/([a-zA-Zà-öÀ-Öø-ÿØ-ßĀ-ʯ]),(?=[0-9])/g, "$1, "] ],
    "add_space_around_hyphens":   [ [/ [-–-](?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ"«“'‘])/g, "$& "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ"»”'’])([-–-]) /g, "$1 $2 "] ],
    "add_space_repair":           [ [/DnT, ([wA])\b/g, "DnT,$1"] ],
    //// erase
    "erase_non_breaking_hyphens": [ [/­/g, ""] ],
    //// typographic signs
    "ts_apostrophe":              [ [/\b([ldnjmtscç])['´‘′`ʼ](?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])/ig, "$1’"],
                                    [/\b(qu|jusqu|lorsqu|puisqu|quoiqu|quelqu|presqu|entr|aujourd|prud)['´‘′`ʼ]/ig, "$1’"] ],
    "ts_ellipsis":                [ [/\.\.\./g, "…"],
                                    [/…\.\./g, "……"],
                                    [/…\.(?!\.)/g, "…"] ],
    "ts_n_dash_middle":           [ [/ [--] /g, " – "],
                                    [/ [--],/g, " –,"] ],
    "ts_m_dash_middle":           [ [/ [-–] /g, " - "],
                                    [/ [-–],/g, " -,"] ],
    "ts_n_dash_start":            [ [/^[--][  ]/gm, "– "],
                                    [/^– /gm, "– "],
                                    [/^[-–-](?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ.…])/gm, "– "] ],
    "ts_m_dash_start":            [ [/^[-–][  ]/gm, "- "],
                                    [/^- /gm, "- "],
                                    [/^«[  ][-–-][  ]/gm, "« - "],
                                    [/^[-–-](?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ.…])/gm, "- "] ],
    "ts_quotation_marks":         [ [/"([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ]+)"/g, "“$1”"],
                                    [/''([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ]+)''/g, "“$1”"],
                                    [/'([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ]+)'/g, "“$1”"],
                                    [/^(?:"|'')(?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…])/gm, "« "],
                                    [/ (?:"|'')(?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…])/g, " « "],
                                    [/\((?:"|'')(?=[a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ…])/g, "(« "],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])(?:"|'')$/gm, "$1 »"],
                                    [/([a-zA-Zà-ö0-9À-Öø-ÿØ-ßĀ-ʯ])(?:"|'')(?=[ ,.:;?!…)\]])/g, "$1 »"],
                                    [/([.!?…])" /g, "$1 » "],
                                    [/([.!?…])"$/gm, "$1 »"] ],
    "ts_spell":                   [ [/coeur/g, "cœur"], [/Coeur/g, "Cœur"],
                                    [/coel(?=[aeio])/g, "cœl"], [/Coel(?=[aeio])/g, "Cœl"],
                                    [/choeur/g, "chœur"], [/Choeur/g, "Chœur"],
                                    [/foet/g, "fœt"], [/Foet/g, "Fœt"],
                                    [/oeil/g, "œil"], [/Oeil/g, "Œil"],
                                    [/oeno/g, "œno"], [/Oeno/g, "Œno"],
                                    [/oesoph/g, "œsoph"], [/Oesoph/g, "Œsoph"],
                                    [/oestro/g, "œstro"], [/Oestro/g, "Œstro"],
                                    [/oeuf/g, "œuf"], [/Oeuf/g, "Œuf"],
                                    [/oeuvr/g, "œuvr"], [/Oeuvr/g, "Œuvr"],
                                    [/moeur/g, "mœur"], [/Moeur/g, "Mœur"],
                                    [/noeu/g, "nœu"], [/Noeu/g, "Nœu"],
                                    [/soeur/g, "sœur"], [/Soeur/g, "Sœur"],
                                    [/voeu/g, "vœu"], [/Voeu/g, "Vœu"],
                                    [/aequo/g, "æquo"], [/Aequo/g, "Æquo"],
                                    [/Ca /g, "Ça "], [/ ca([ ,.!;:])/g, " ça$1"],
                                    [/(Ce(?:ux|lles?|lui))-la /g, "$1-là "], [/ (ce(?:ux|lles?|lui))-la/g, " $1-là"],
                                    [/ malgre /g, " malgré "], [/Malgre /g, "Malgré "],
                                    [/ etre([ ,.!;:])/g, " être$1"], [/Etre([ ,.!;:])/g, "Être$1"],
                                    [/ tres([ ,.!;:])/g, " très$1"], [/Tres /g, "Très "],
                                    [/\bEtai([ts]|ent)\b/g, "Étai$1"],
                                    [/\bE(tat|cole|crit|poque|tude|ducation|glise|conomi(?:qu|)e|videmment|lysée|tienne|thiopie|cosse|gypt(?:e|ien)|rythrée|pinal|vreux)/g, "É$1"] ],
    "ts_ligature_ffi_do":         [ [/ffi/g, "ﬃ"] ],
    "ts_ligature_ffl_do":         [ [/ffl/g, "ﬄ"] ],
    "ts_ligature_fi_do":          [ [/fi/g, "ﬁ"] ],
    "ts_ligature_fl_do":          [ [/fl/g, "ﬂ"] ],
    "ts_ligature_ff_do":          [ [/ff/g, "ﬀ"] ],
    "ts_ligature_ft_do":          [ [/ft/g, "ﬅ"] ],
    "ts_ligature_st_do":          [ [/st/g, "ﬆ"] ],
    "ts_ligature_fi_undo":        [ [/ﬁ/g, "fi"] ],
    "ts_ligature_fl_undo":        [ [/ﬂ/g, "fl"] ],
    "ts_ligature_ff_undo":        [ [/ﬀ/g, "ff"] ],
    "ts_ligature_ffi_undo":       [ [/ﬃ/g, "ffi"] ],
    "ts_ligature_ffl_undo":       [ [/ﬄ/g, "ffl"] ],
    "ts_ligature_ft_undo":        [ [/ﬅ/g, "ft"] ],
    "ts_ligature_st_undo":        [ [/ﬆ/g, "st"] ],
    "ts_units":                   [ [/\bN\.([ms])\b/g, "N·$1"], // N·m et N·m-1, N·s
                                    [/\bW\.h\b/g, "W·h"],
                                    [/\bPa\.s\b/g, "Pa·s"],
                                    [/\bA\.h\b/g, "A·h"],
                                    [/Ω\.m\b/g, "Ω·m"],
                                    [/\bS\.m\b/g, "S·m"],
                                    [/\bg\.s(?=-1)\b/g, "g·s"],
                                    [/\bm\.s(?=-[12])\b/g, "m·s"],
                                    [/\bg\.m(?=2|-3)\b/g, "g·m"],
                                    [/\bA\.m(?=-1)\b/g, "A·m"],
                                    [/\bJ\.K(?=-1)\b/g, "J·K"],
                                    [/\bW\.m(?=-2)\b/g, "W·m"],
                                    [/\bcd\.m(?=-2)\b/g, "cd·m"],
                                    [/\bC\.kg(?=-1)\b/g, "C·kg"],
                                    [/\bH\.m(?=-1)\b/g, "H·m"],
                                    [/\bJ\.kg(?=-1)\b/g, "J·kg"],
                                    [/\bJ\.m(?=-3)\b/g, "J·m"],
                                    [/\bm[2²]\.s\b/g, "m²·s"],
                                    [/\bm[3³]\.s(?=-1)\b/g, "m³·s"],
                                    //[/\bJ.kg-1.K-1\b/g, "J·kg-1·K-1"],
                                    //[/\bW.m-1.K-1\b/g, "W·m-1·K-1"],
                                    //[/\bW.m-2.K-1\b/g, "W·m-2·K-1"],
                                    [/\b(Y|Z|E|P|T|G|M|k|h|da|d|c|m|µ|n|p|f|a|z|y)Ω/g, "$1Ω"] ],
    //// misc
    "ordinals_exponant":          [ [/\b([0-9]+)(?:i?[èe]me|è|e)\b/g, "$1ᵉ"],
                                    [/\b([XVICL]+)(?:i?[èe]me|è)\b/g, "$1ᵉ"],
                                    [/\b((?:au|l[ea]|du) [XVICL])e\b/g, "$1ᵉ"],
                                    [/\b([XVI])e(?= siècle)/g, "$1ᵉ"],
                                    [/\b([1I])er\b/g, "$1ᵉʳ"],
                                    [/\b([1I])re\b/g, "$1ʳᵉ"] ],
    "ordinals_no_exponant":       [ [/\b([0-9]+)(?:i?[èe]me|è)\b/g, "$1e"],
                                    [/\b([XVICL]+)(?:i?[èe]me|è)\b/g, "$1e"],
                                    [/\b([1I])ᵉʳ\b/g, "$1er"],
                                    [/\b([1I])ʳᵉ\b/g, "$1er"] ],
    "etc":                        [ [/etc(…|\.\.\.?)/g, "etc."],
                                    [/\b etc\./g, ", etc."] ],
    "missing_hyphens":            [ [/[ -]t[’'](?=il\b|elle|on\b)/g, "-t-"],
                                    [/ t-(?=il|elle|on)/g, "-t-"],
                                    [/[ -]t[’'-](?=ils|elles)/g, "-"],
                                    [/([td])-t-(?=il|elle|on)/g, "$1-"],
                                    [/dix (sept|huit|neuf)/g, "dix-$1"],
                                    [/quatre vingt/g, "quatre-vingt"],
                                    [/(soixante|quatre-vingt) dix/g, "$1-dix"],
                                    [/(vingt|trente|quarante|cinquante|soixante(?:-dix|)|quatre-vingt(?:-dix|)) (deux|trois|quatre|cinq|six|sept|huit|neuf)\b/g, "$1-$2"],
                                    [/ ce(lles?|lui|ux) (ci|là)/g, "ce$1-$2"],
                                    [/Ce(lles?|lui|ux) (ci|là)/g, "Ce$1-$2"],
                                    [/^Ci (joint|desso?us|contre|devant|avant|après|incluse|g[îi]t|gisent)/gm, "Ci-$1"],
                                    [/ ci (joint|desso?us|contre|devant|avant|après|incluse|g[îi]t|gisent)/g, " ci-$1"],
                                    [/vis à vis/g, "vis-à-vis"],
                                    [/Vis à vis/g, "Vis-à-vis"],
                                    [/week end/g, "week-end"],
                                    [/Week end/g, "Week-end"],
                                    [/(plus|moins) value/ig, "$1-value"] ],
    //// missing apostrophes
    "ma_word":                    [ [/[  ](qu|lorsqu|puisqu|quoiqu|presqu|jusqu|aujourd|entr|quelqu|prud) /ig, "$1’"],
                                    [/^(qu|lorsqu|puisqu|quoiqu|presqu|jusqu|aujourd|entr|quelqu|prud) /ig, "$1’"] ],
    "ma_1letter_lowercase":       [ [/[  ]([ldjnmtscç]) (?=[aàeéêiîoôuyhAÀEÉÊIÎOÔUYH])/g, "$1’"] ],
    "ma_1letter_uppercase":       [ [/[  ]([LDJNMTSCÇ]) (?=[aàeéêiîoôuyhAÀEÉÊIÎOÔUYH])/g, "$1’"],
                                    [/^([LDJNMTSCÇ]) (?=[aàeéêiîoôuyhAÀEÉÊIÎOÔUYH])/g, "$1’"] ]
};


const dTFDefaultOptions = new Map ([
    ["ts_units", true],
    ["start_of_paragraph", true],
    ["end_of_paragraph", true],
    ["between_words", true],
    ["before_punctuation", true],
    ["within_parenthesis", true],
    ["within_square_brackets", true],
    ["within_quotation_marks", true],
    ["nbsp_before_punctuation", true],
    ["nbsp_within_quotation_marks", true],
    ["nbsp_within_numbers", true],
    ["nnbsp_before_punctuation", false],
    ["nnbsp_within_quotation_marks", false],
    ["nnbsp_within_numbers", false],
    ["nbsp_titles", false],
    ["nbsp_before_symbol", true],
    ["nbsp_before_units", true],
    ["nbsp_repair", true],
    ["add_space_after_punctuation", true],
    ["add_space_around_hyphens", true],
    ["add_space_repair", true],
    ["erase_non_breaking_hyphens", false],
    ["ts_apostrophe", true],
    ["ts_ellipsis", true],
    ["ts_n_dash_middle", true],
    ["ts_m_dash_middle", false],
    ["ts_n_dash_start", false],
    ["ts_m_dash_start", true],
    ["ts_quotation_marks", true],
    ["ts_spell", true],
    ["ts_ligature_ffi_do", false],
    ["ts_ligature_ffl_do", false],
    ["ts_ligature_fi_do", false],
    ["ts_ligature_fl_do", false],
    ["ts_ligature_ff_do", false],
    ["ts_ligature_ft_do", false],
    ["ts_ligature_st_do", false],
    ["ts_ligature_fi_undo", false],
    ["ts_ligature_fl_undo", false],
    ["ts_ligature_ff_undo", false],
    ["ts_ligature_ffi_undo", false],
    ["ts_ligature_ffl_undo", false],
    ["ts_ligature_ft_undo", false],
    ["ts_ligature_st_undo", false],
    ["ordinals_exponant", false],
    ["ordinals_no_exponant", true],
    ["etc", true],
    ["missing_hyphens", true],
    ["ma_word", true],
    ["ma_1letter_lowercase", false],
    ["ma_1letter_uppercase", false]
]);


class TextFormatter {

    constructor (bDebug=false) {
        this.sLang = "fr";
        this.bDebug = bDebug;
        //don't change this in external ;)
        this.dOptions = dTFDefaultOptions.gl_shallowCopy();
    }

    formatText (sText, dOpt=null) {
        if (dOpt !== null) {
            this.dOptions.gl_updateOnlyExistingKeys(dOpt);
        }
        for (let [sOptName, bVal] of this.dOptions) {
            //console.log(oReplTable);
            if (bVal && oReplTable[sOptName]) {
                for (let [zRgx, sRep] of oReplTable[sOptName]) {
                    sText = sText.replace(zRgx, sRep);
                }
            }
        }
        return sText;
    }

    formatTextCount (sText, dOpt=null) {
        let nCount = 0;
        if (dOpt !== null) {
            this.dOptions.gl_updateOnlyExistingKeys(dOpt);
        }
        for (let [sOptName, bVal] of this.dOptions) {
            if (bVal && oReplTable[sOptName]) {
                for (let [zRgx, sRep] of oReplTable[sOptName]) {
                    nCount += (sText.match(zRgx) || []).length;
                    sText = sText.replace(zRgx, sRep);
                }
            }
        }
        return [sText, nCount];
    }

    formatTextRule (sText, sRuleName) {
        if (oReplTable[sRuleName]) {
            for (let [zRgx, sRep] of oReplTable[sRuleName]) {
                sText = sText.replace(zRgx, sRep);
            }
        } else if (this.bDebug){
            console.log("# Error. TF: there is no option “" + sRuleName+ "”.");
        }
        return sText;
    }

    formatTextRuleCount (sText, sRuleName) {
        let nCount = 0;
        if (oReplTable[sRuleName]) {
            for (let [zRgx, sRep] of oReplTable[sRuleName]) {
                nCount += (sText.match(zRgx) || []).length;
                sText = sText.replace(zRgx, sRep);
            }
        } else if (this.bDebug){
            console.log("# Error. TF: there is no option “" + sRuleName+ "”.");
        }
        return [sText, nCount];
    }

    removeHyphenAtEndOfParagraphs (sText) {
        sText = sText.replace(/-[  ]*\n/gm, "");
        return sText;
    }

    removeHyphenAtEndOfParagraphsCount (sText) {
        let nCount = (sText.match(/-[  ]*\n/gm) || []).length;
        sText = sText.replace(/-[  ]*\n/gm, "");
        return [sText, nCount];
    }

    mergeContiguousParagraphs (sText) {
        sText = sText.replace(/^[  ]+$/gm, ""); // clear empty paragraphs
        let s = "";
        for (let sParagraph of this.getParagraph(sText)) {
            if (sParagraph === "") {
                s += "\n";
            } else {
                s += sParagraph + " ";
            }
        }
        s = s.replace(/  +/gm, " ").replace(/ $/gm, "");
        return s;
    }

    mergeContiguousParagraphsCount (sText) {
        let nCount = 0;
        sText = sText.replace(/^[  ]+$/gm, ""); // clear empty paragraphs
        let s = "";
        for (let sParagraph of this.getParagraph(sText)) {
            if (sParagraph === "") {
                s += "\n";
            } else {
                s += sParagraph + " ";
                nCount += 1;
            }
        }
        s = s.replace(/  +/gm, " ").replace(/ $/gm, "");
        return [s, nCount];
    }

    * getParagraph (sText, sSep="\n") {
        // generator: returns paragraphs of text
        let iStart = 0;
        let iEnd = 0;
        while ((iEnd = sText.indexOf(sSep, iStart)) !== -1) {
            yield sText.slice(iStart, iEnd);
            iStart = iEnd + 1;
        }
        yield sText.slice(iStart);
    }

    getDefaultOptions () {
        //we return a copy to make sure they are no modification in external
        return dTFDefaultOptions.gl_shallowCopy();
    }

    getOptions () {
        //we return a copy to make sure they are no modification in external
        return this.dOptions.gl_shallowCopy();
    }

    setOptions (dOpt=null) {
        if (dOpt !== null) {
            this.dOptions.gl_updateOnlyExistingKeys(dOpt);
        } else if (this.bDebug){
            console.log("# Error. TF: no option to change.");
        }
    }
}


if (typeof(exports) !== 'undefined') {
    exports.TextFormatter = TextFormatter;
}
