/* What changed, newest first — the only place release notes live.

   The popup shows every entry above the one a device last ran, so someone who
   skips three builds still reads all three. Order in this array is the truth;
   nothing here is version-compared, so no semver parsing has to be right.

   Adding a release: bump `version` in package.json and add its entry here in the
   same commit. A bump with no entry ships silently rather than announcing a
   version it cannot describe. */
export const CHANGELOG = [
  {
    version: "0.7.0",
    changes: [
      "The Verbs tab runs dictionary, て, ない and たい now: each form gets a godan table and a table for the verbs its ending cannot predict.",
      "ある sits in the ない tables where you would go looking for it, being the one verb with no ない form at all.",
      "行く is in both of the new pairs to be crossed off — the verb that lies about its て form is honest about the other two.",
      "A chart for asking permission and refusing it, 〜てもいいですか through 〜てはいけません, with the は that is said わ flagged as the exception it is.",
      "In the brief, a word's meaning sits level with its kanji instead of riding up beside the furigana.",
    ],
  },
  {
    version: "0.6.0",
    changes: [
      "The Quiz tab turns into a stack of flash cards: a form on the front, and on the back the word it came from, what it means, and what the form is called.",
      "The back shows the morphemes too, so a card says why 食べました is the polite past rather than only that it is.",
      "Say whether you knew it and the answer counts toward Progress like any other.",
      "Lookup finds a word by whichever spelling you read it in: 分かる, 解る and 判る are three ways to the same entry, and 拘る and 有難う are findable by their kanji at last.",
      "The whole of JMdict is offline now, not just the common words. The rest arrives as a second chunk, fetched only when the common ones have nothing — so an ordinary lookup is no slower, and a word from the wild is still there on a plane.",
    ],
  },
  {
    version: "0.5.0",
    changes: [
      "The deck says when words have piled up since you last looked — tap it for a brief that lists them by the day they arrived, with how they have drilled so far.",
      "Drill these asks the quiz about exactly those words, whatever your scope is set to.",
      "Closing the brief is what marks it read, so the next one starts where this one ended.",
    ],
  },
  {
    version: "0.4.0",
    changes: [
      "Every chart drills: the Quiz button in its heading asks the readings of that table, with the wrong answers taken from the same table.",
      "A whole subject drills at once too — Quiz the whole tab spreads its twelve questions evenly across every chart on the page, however lopsided their sizes.",
      "A reading that breaks its chart's pattern says so when you miss it.",
    ],
  },
  {
    version: "0.3.0",
    changes: [
      "The verb charts give the dictionary form and the て form a table each, so neither has to scroll sideways on a phone.",
      "Looking a word up works from the form you heard: 食べます and 行って find 食べる and 行く.",
      "Potential, passive and causative unwind too, however many are stacked — 食べさせられます reaches 食べる.",
      "Chart tabs wrap onto a second line instead of running off the screen.",
      "A search that finds nothing carries the term into the add-word lookup.",
      "Charts have a Directions tab.",
    ],
  },
  {
    version: "0.2.0",
    changes: [
      "An update now introduces itself: this note, once per new version, listing what changed.",
      "Words share to the phone's own share sheet, and fall back to the clipboard where there is none.",
      "Browsers that have not installed the app yet are offered the install prompt.",
      "Charts cover the て form, with its rule in the row label.",
      "Word classes and forms say what they mean, not just what they are called.",
      "Deck rows highlight the button under the finger instead of the whole row.",
    ],
  },
];
