use regex::RegexBuilder;
use serde::Serialize;
use specta::Type;

#[derive(Debug, Clone, Serialize, Type)]
pub struct PdfTextRun {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A single text-search hit within a PDF page.
#[derive(Debug, Clone, Serialize, Type)]
pub struct PdfSearchHit {
    pub page_index: u32,
    pub snippet: String,
}

/// Characters of context shown around each match in a snippet.
const SNIPPET_RADIUS: usize = 60;

/// Case-insensitive substring search over a page's text.
///
/// Returns up to `limit` snippets, one per match, each containing the match
/// surrounded by a fixed amount of context. Pure function, unit-testable.
pub fn find_matches(text: &str, query: &str, limit: usize) -> Vec<String> {
    let query = query.trim();
    if query.is_empty() || limit == 0 {
        return Vec::new();
    }

    let Ok(re) = RegexBuilder::new(&regex::escape(query))
        .case_insensitive(true)
        .build()
    else {
        return Vec::new();
    };

    re.find_iter(text)
        .take(limit)
        .map(|matched| make_snippet(text, matched.start(), matched.end()))
        .collect()
}

fn make_snippet(text: &str, match_start: usize, match_end: usize) -> String {
    let start = floor_char_boundary(text, match_start.saturating_sub(SNIPPET_RADIUS));
    let end = ceil_char_boundary(text, (match_end + SNIPPET_RADIUS).min(text.len()));

    let has_leading = start > 0;
    let has_trailing = end < text.len();
    let body = &text[start..end];

    let mut snippet = String::new();
    if has_leading {
        snippet.push('…');
    }
    snippet.push_str(body);
    if has_trailing {
        snippet.push('…');
    }
    snippet
}

fn floor_char_boundary(text: &str, mut index: usize) -> usize {
    if index >= text.len() {
        return text.len();
    }
    while !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(text: &str, mut index: usize) -> usize {
    if index >= text.len() {
        return text.len();
    }
    while !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_returns_no_hits() {
        assert!(find_matches("some text", "", 10).is_empty());
        assert!(find_matches("some text", "   ", 10).is_empty());
    }

    #[test]
    fn matches_are_case_insensitive() {
        let snippets = find_matches("Foo BAR foo bar", "foo", 10);
        assert_eq!(snippets.len(), 2);
    }

    #[test]
    fn respects_limit() {
        let snippets = find_matches("aaaa", "aa", 1);
        assert_eq!(snippets.len(), 1);
    }

    #[test]
    fn snippet_contains_match_with_context() {
        let text = "prefix surrounding the needle in a longer page body";
        let snippets = find_matches(text, "needle", 10);
        assert_eq!(snippets.len(), 1);
        assert!(snippets[0].contains("needle"));
    }

    #[test]
    fn snippet_ellipsizes_long_text() {
        let text = format!("{} TARGET {}", "x".repeat(300), "y".repeat(300));
        let snippets = find_matches(&text, "TARGET", 10);
        assert_eq!(snippets.len(), 1);
        assert!(snippets[0].starts_with('…'));
        assert!(snippets[0].ends_with('…'));
        assert!(snippets[0].contains("TARGET"));
    }

    #[test]
    fn snippet_handles_non_ascii_boundaries() {
        let text = "日本語のテキストの中に TARGET が出現する";
        let snippets = find_matches(text, "TARGET", 10);
        assert_eq!(snippets.len(), 1);
        assert!(snippets[0].contains("TARGET"));
    }
}
