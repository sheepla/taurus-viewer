use pdfium_render::prelude::*;
use serde::Serialize;
use specta::Type;

/// A single outline (bookmark) entry in a PDF document.
#[derive(Debug, Clone, Serialize, Type)]
pub struct PdfOutlineNode {
    pub title: String,
    pub page_index: u32,
    pub children: Vec<PdfOutlineNode>,
}

/// Extracts the PDF bookmark tree as a list of `PdfOutlineNode` values.
///
/// Returns an empty list when the document has no bookmarks (or when the
/// bookmark tree cannot be traversed), which the frontend renders as the
/// "No outline available" empty state.
pub fn collect_outline(document: &PdfDocument) -> Vec<PdfOutlineNode> {
    let Some(root) = document.bookmarks().root() else {
        return Vec::new();
    };
    collect_siblings(Some(root))
}

fn collect_siblings(start: Option<PdfBookmark<'_>>) -> Vec<PdfOutlineNode> {
    let mut nodes = Vec::new();
    let mut current = start;
    while let Some(bookmark) = current {
        current = bookmark.next_sibling();
        nodes.push(node_from_bookmark(bookmark));
    }
    nodes
}

fn node_from_bookmark(bookmark: PdfBookmark<'_>) -> PdfOutlineNode {
    let title = bookmark.title().unwrap_or_default();
    let page_index = bookmark
        .destination()
        .and_then(|destination| destination.page_index().ok())
        .unwrap_or(0) as u32;
    let children = collect_siblings(bookmark.first_child());
    PdfOutlineNode {
        title,
        page_index,
        children,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn serializes_to_expected_ts_shape() {
        let node = PdfOutlineNode {
            title: "Chapter 1".to_string(),
            page_index: 2,
            children: vec![PdfOutlineNode {
                title: "1.1".to_string(),
                page_index: 3,
                children: vec![],
            }],
        };

        let json: Value = serde_json::to_value(vec![node]).unwrap();
        assert_eq!(
            json,
            serde_json::json!([{
                "title": "Chapter 1",
                "page_index": 2,
                "children": [{ "title": "1.1", "page_index": 3, "children": [] }]
            }])
        );
    }
}
