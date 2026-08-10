pub mod session;

use std::io::Read;
use std::path::Path;
use std::collections::HashMap;
use zip::ZipArchive;

use crate::error::AppError;

pub struct EpubChapter {
    pub title: String,
    pub href: String,
    pub content: String,
}

pub struct EpubMetadata {
    pub title: String,
    pub author: String,
    pub chapters: Vec<EpubChapter>,
}

pub fn extract_epub_metadata(file_path: &Path) -> Result<EpubMetadata, AppError> {
    let file = std::fs::File::open(file_path)
        .map_err(|e| AppError::Epub(format!("Failed to open EPUB file: {}", e)))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| AppError::Epub(format!("Failed to read EPUB archive: {}", e)))?;

    // Read container.xml to find the OPF file
    let container_path = "META-INF/container.xml";
    let container_content = {
        let mut container_file = archive
            .by_name(container_path)
            .map_err(|e| AppError::Epub(format!("Failed to find container.xml: {}", e)))?;

        let mut content = String::new();
        container_file
            .read_to_string(&mut content)
            .map_err(|e| AppError::Epub(format!("Failed to read container.xml: {}", e)))?;
        content
    };

    let opf_path = extract_opf_path(&container_content)
        .ok_or_else(|| AppError::Epub("Could not find OPF file path in container.xml".to_string()))?;

    // Read OPF file
    let opf_content = {
        let mut opf_file = archive
            .by_name(&opf_path)
            .map_err(|e| AppError::Epub(format!("Failed to find OPF file: {}", e)))?;

        let mut content = String::new();
        opf_file
            .read_to_string(&mut content)
            .map_err(|e| AppError::Epub(format!("Failed to read OPF file: {}", e)))?;
        content
    };

    let title = extract_metadata_field(&opf_content, "dc:title").unwrap_or("Unknown".to_string());
    let author = extract_metadata_field(&opf_content, "dc:creator").unwrap_or("Unknown".to_string());

    // Parse manifest items (id -> href)
    let mut manifest = HashMap::new();
    let mut search_idx = 0;
    while let Some(item_start) = (opf_content[search_idx..]).find("<item") {
        let start = search_idx + item_start;
        if let Some(item_end) = (opf_content[start..]).find('>') {
            let tag = &opf_content[start..start + item_end + 1];
            let id = extract_attribute(tag, "id");
            let href = extract_attribute(tag, "href");
            if let (Some(id), Some(href)) = (id, href) {
                manifest.insert(id, href);
            }
            search_idx = start + item_end + 1;
        } else {
            break;
        }
    }

    // Parse spine itemrefs (idref order)
    let mut spine_ids = Vec::new();
    search_idx = 0;
    while let Some(ref_start) = (opf_content[search_idx..]).find("<itemref") {
        let start = search_idx + ref_start;
        if let Some(ref_end) = (opf_content[start..]).find('>') {
            let tag = &opf_content[start..start + ref_end + 1];
            if let Some(idref) = extract_attribute(tag, "idref") {
                spine_ids.push(idref);
            }
            search_idx = start + ref_end + 1;
        } else {
            break;
        }
    }

    let opf_dir = Path::new(&opf_path).parent().unwrap_or(Path::new(""));
    let mut chapters = Vec::new();

    for (index, idref) in spine_ids.iter().enumerate() {
        if let Some(href) = manifest.get(idref) {
            let item_path = opf_dir.join(href);
            let item_path_str = item_path.to_string_lossy().replace('\\', "/");

            let content = match archive.by_name(&item_path_str) {
                Ok(mut entry) => {
                    let mut html = String::new();
                    entry.read_to_string(&mut html).unwrap_or_default();
                    html
                }
                Err(_) => format!("<p>Failed to load chapter content for {}</p>", href),
            };

            let chapter_title = extract_html_title(&content)
                .unwrap_or_else(|| format!("Chapter {}", index + 1));

            chapters.push(EpubChapter {
                title: chapter_title,
                href: href.clone(),
                content,
            });
        }
    }

    if chapters.is_empty() {
        chapters.push(EpubChapter {
            title: "Chapter 1".to_string(),
            href: "".to_string(),
            content: "<h1>EPUB Document</h1><p>No chapters found in spine.</p>".to_string(),
        });
    }

    Ok(EpubMetadata {
        title,
        author,
        chapters,
    })
}

fn extract_opf_path(container_xml: &str) -> Option<String> {
    extract_attribute(container_xml, "full-path")
}

fn extract_attribute(tag: &str, attr_name: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr_name);
    if let Some(start) = tag.find(&pattern) {
        let start = start + pattern.len();
        if let Some(end) = tag[start..].find('"') {
            return Some(tag[start..start + end].to_string());
        }
    }
    let pattern_single = format!("{}='", attr_name);
    if let Some(start) = tag.find(&pattern_single) {
        let start = start + pattern_single.len();
        if let Some(end) = tag[start..].find('\'') {
            return Some(tag[start..start + end].to_string());
        }
    }
    None
}

fn extract_metadata_field(opf_content: &str, field_name: &str) -> Option<String> {
    let start_tag = format!("<{}", field_name);
    let end_tag = format!("</{}>", field_name);
    
    if let Some(start) = opf_content.find(&start_tag) {
        if let Some(content_start) = opf_content[start..].find('>') {
            let content_start = start + content_start + 1;
            if let Some(content_end) = opf_content[content_start..].find(&end_tag) {
                let content = &opf_content[content_start..content_start + content_end];
                return Some(content.trim().to_string());
            }
        }
    }
    None
}

fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    if let Some(start) = lower.find("<title>") {
        let start = start + 7;
        if let Some(end) = lower[start..].find("</title>") {
            let title = html[start..start + end].trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}
