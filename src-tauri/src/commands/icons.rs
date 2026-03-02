use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

pub struct IconCache {
    pub cache: Mutex<HashMap<String, String>>,
}

pub struct IconCacheLarge {
    pub cache: Mutex<HashMap<String, String>>,
}

pub struct ThumbnailCache {
    pub cache: Mutex<HashMap<(String, u32), String>>,
}

#[tauri::command]
pub async fn get_file_icons(
    extensions: Vec<String>,
    icon_cache: State<'_, IconCache>,
) -> Result<HashMap<String, String>, String> {
    let mut result = HashMap::new();
    let missing = {
        let cache = icon_cache.cache.lock().unwrap_or_else(|e| e.into_inner());
        let mut missing = Vec::new();
        for ext in &extensions {
            if let Some(cached) = cache.get(ext) {
                result.insert(ext.clone(), cached.clone());
            } else {
                missing.push(ext.clone());
            }
        }
        missing
    };

    if missing.is_empty() {
        return Ok(result);
    }

    let generated = tauri::async_runtime::spawn_blocking(move || {
        let mut gen = HashMap::new();
        for ext in missing {
            if let Ok(data_url) = get_shell_icon(&ext) {
                gen.insert(ext, data_url);
            }
        }
        gen
    })
    .await
    .map_err(|e| e.to_string())?;

    {
        let mut cache = icon_cache.cache.lock().unwrap_or_else(|e| e.into_inner());
        for (ext, data_url) in &generated {
            cache.insert(ext.clone(), data_url.clone());
        }
    }

    result.extend(generated);
    Ok(result)
}

#[tauri::command]
pub async fn get_file_icons_large(
    extensions: Vec<String>,
    icon_cache_large: State<'_, IconCacheLarge>,
) -> Result<HashMap<String, String>, String> {
    let mut result = HashMap::new();
    let missing = {
        let cache = icon_cache_large.cache.lock().unwrap_or_else(|e| e.into_inner());
        let mut missing = Vec::new();
        for ext in &extensions {
            if let Some(cached) = cache.get(ext) {
                result.insert(ext.clone(), cached.clone());
            } else {
                missing.push(ext.clone());
            }
        }
        missing
    };

    if missing.is_empty() {
        return Ok(result);
    }

    let generated = tauri::async_runtime::spawn_blocking(move || {
        let mut gen = HashMap::new();
        for ext in missing {
            if let Ok(data_url) = get_shell_icon_large(&ext) {
                gen.insert(ext, data_url);
            }
        }
        gen
    })
    .await
    .map_err(|e| e.to_string())?;

    {
        let mut cache = icon_cache_large.cache.lock().unwrap_or_else(|e| e.into_inner());
        for (ext, data_url) in &generated {
            cache.insert(ext.clone(), data_url.clone());
        }
    }

    result.extend(generated);
    Ok(result)
}

#[tauri::command]
pub async fn get_thumbnails(
    paths: Vec<String>,
    size: u32,
    thumbnail_cache: State<'_, ThumbnailCache>,
) -> Result<HashMap<String, String>, String> {
    let mut result = HashMap::new();
    let missing = {
        let cache = thumbnail_cache.cache.lock().unwrap_or_else(|e| e.into_inner());
        let mut missing = Vec::new();
        for path in &paths {
            let key = (path.clone(), size);
            if let Some(cached) = cache.get(&key) {
                result.insert(path.clone(), cached.clone());
            } else {
                missing.push(path.clone());
            }
        }
        missing
    };

    if missing.is_empty() {
        return Ok(result);
    }

    let generated = tauri::async_runtime::spawn_blocking(move || {
        let mut gen = HashMap::new();
        for path in missing {
            if let Ok(data_url) = generate_thumbnail(&path, size) {
                gen.insert(path, data_url);
            }
        }
        gen
    })
    .await
    .map_err(|e| e.to_string())?;

    {
        let mut cache = thumbnail_cache.cache.lock().unwrap_or_else(|e| e.into_inner());
        for (path, data_url) in &generated {
            cache.insert((path.clone(), size), data_url.clone());
        }
    }

    result.extend(generated);
    Ok(result)
}

fn generate_thumbnail(path: &str, size: u32) -> Result<String, String> {
    let img = image::open(path).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(size, size);
    let rgba = thumb.to_rgba8();

    let mut png_buf = std::io::Cursor::new(Vec::new());
    rgba.write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        png_buf.into_inner(),
    );

    Ok(format!("data:image/png;base64,{}", b64))
}

#[cfg(windows)]
fn get_shell_icon_large(ext: &str) -> Result<String, String> {
    use std::mem;
    use std::ptr;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL,
    };
    use windows_sys::Win32::UI::Controls::ImageList_GetIcon;
    use windows_sys::Win32::UI::Shell::{
        SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_SYSICONINDEX,
        SHGFI_USEFILEATTRIBUTES,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::DestroyIcon;

    // SHIL_JUMBO = 256×256 アイコン
    const SHIL_JUMBO: i32 = 0x4;
    // IID_IImageList: {46EB5926-582E-4017-9FDF-E8998DAA0950}
    const IID_IIMAGELIST: windows_sys::core::GUID = windows_sys::core::GUID {
        data1: 0x46EB5926,
        data2: 0x582E,
        data3: 0x4017,
        data4: [0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50],
    };

    let is_dir = ext == "__directory__";
    let dummy: Vec<u16> = if is_dir {
        "directory\0".encode_utf16().collect()
    } else {
        format!("dummy.{}\0", ext).encode_utf16().collect()
    };
    let file_attrs = if is_dir {
        FILE_ATTRIBUTE_DIRECTORY
    } else {
        FILE_ATTRIBUTE_NORMAL
    };

    // アイコンインデックスを取得
    let mut shfi: SHFILEINFOW = unsafe { mem::zeroed() };
    let result = unsafe {
        SHGetFileInfoW(
            dummy.as_ptr(),
            file_attrs,
            &mut shfi as *mut SHFILEINFOW,
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX | SHGFI_USEFILEATTRIBUTES,
        )
    };
    if result == 0 {
        return get_shell_icon_large_32(ext);
    }
    let icon_index = shfi.iIcon;

    // Jumbo (256×256) イメージリストからアイコン取得
    let mut pimgl: *mut std::ffi::c_void = ptr::null_mut();
    let hr = unsafe { SHGetImageList(SHIL_JUMBO, &IID_IIMAGELIST, &mut pimgl) };
    if hr < 0 || pimgl.is_null() {
        return get_shell_icon_large_32(ext);
    }

    let himl = pimgl as isize;
    let hicon = unsafe { ImageList_GetIcon(himl, icon_index, 0) };
    if hicon == 0 {
        return get_shell_icon_large_32(ext);
    }

    let data_url = hicon_to_data_url_sized(hicon, 256);
    unsafe { DestroyIcon(hicon) };
    data_url
}

/// フォールバック: 従来の32×32アイコン取得
#[cfg(windows)]
fn get_shell_icon_large_32(ext: &str) -> Result<String, String> {
    use std::mem;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL,
    };
    use windows_sys::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_USEFILEATTRIBUTES,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::DestroyIcon;

    let is_dir = ext == "__directory__";
    let dummy: Vec<u16> = if is_dir {
        "directory\0".encode_utf16().collect()
    } else {
        format!("dummy.{}\0", ext).encode_utf16().collect()
    };
    let file_attrs = if is_dir {
        FILE_ATTRIBUTE_DIRECTORY
    } else {
        FILE_ATTRIBUTE_NORMAL
    };

    let mut shfi: SHFILEINFOW = unsafe { mem::zeroed() };
    let result = unsafe {
        SHGetFileInfoW(
            dummy.as_ptr(),
            file_attrs,
            &mut shfi as *mut SHFILEINFOW,
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON | SHGFI_USEFILEATTRIBUTES,
        )
    };
    if result == 0 || shfi.hIcon == 0 {
        return Err("SHGetFileInfoW failed".into());
    }

    let data_url = hicon_to_data_url_sized(shfi.hIcon, 32);
    unsafe { DestroyIcon(shfi.hIcon) };
    data_url
}

#[cfg(not(windows))]
fn get_shell_icon_large(_ext: &str) -> Result<String, String> {
    Err("Shell icons are only available on Windows".into())
}

#[cfg(windows)]
fn get_shell_icon(ext: &str) -> Result<String, String> {
    use std::mem;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL,
    };
    use windows_sys::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_SMALLICON, SHGFI_USEFILEATTRIBUTES,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::DestroyIcon;

    let is_dir = ext == "__directory__";

    let dummy: Vec<u16> = if is_dir {
        "directory\0".encode_utf16().collect()
    } else {
        format!("dummy.{}\0", ext).encode_utf16().collect()
    };

    let file_attrs = if is_dir {
        FILE_ATTRIBUTE_DIRECTORY
    } else {
        FILE_ATTRIBUTE_NORMAL
    };

    let mut shfi: SHFILEINFOW = unsafe { mem::zeroed() };
    let result = unsafe {
        SHGetFileInfoW(
            dummy.as_ptr(),
            file_attrs,
            &mut shfi as *mut SHFILEINFOW,
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_SMALLICON | SHGFI_USEFILEATTRIBUTES,
        )
    };

    if result == 0 || shfi.hIcon.is_null() {
        return Err("SHGetFileInfoW failed".into());
    }

    let data_url = hicon_to_data_url(shfi.hIcon);
    unsafe { DestroyIcon(shfi.hIcon) };
    data_url
}

/// HICON を PNG base64 data URL に変換する（公開ヘルパー）
#[cfg(windows)]
pub fn hicon_to_data_url(
    hicon: windows_sys::Win32::UI::WindowsAndMessaging::HICON,
) -> Result<String, String> {
    use std::mem;
    use windows_sys::Win32::Graphics::Gdi::DeleteObject;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut icon_info: ICONINFO = unsafe { mem::zeroed() };
    let ok = unsafe { GetIconInfo(hicon, &mut icon_info) };
    if ok == 0 {
        return Err("GetIconInfo failed".into());
    }

    let hbm_color = icon_info.hbmColor;
    let hbm_mask = icon_info.hbmMask;

    // bitmap→RGBA変換。エラー時もDeleteObjectを確実に呼ぶ
    let result = convert_bitmaps_to_data_url(hbm_color, hbm_mask, 16);

    unsafe {
        if !hbm_color.is_null() {
            DeleteObject(hbm_color as _);
        }
        if !hbm_mask.is_null() {
            DeleteObject(hbm_mask as _);
        }
    }

    result
}

/// HICON を任意サイズの PNG base64 data URL に変換する
#[cfg(windows)]
pub fn hicon_to_data_url_sized(
    hicon: windows_sys::Win32::UI::WindowsAndMessaging::HICON,
    icon_size: i32,
) -> Result<String, String> {
    use std::mem;
    use windows_sys::Win32::Graphics::Gdi::DeleteObject;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut icon_info: ICONINFO = unsafe { mem::zeroed() };
    let ok = unsafe { GetIconInfo(hicon, &mut icon_info) };
    if ok == 0 {
        return Err("GetIconInfo failed".into());
    }

    let hbm_color = icon_info.hbmColor;
    let hbm_mask = icon_info.hbmMask;

    // bitmap→RGBA変換。エラー時もDeleteObjectを確実に呼ぶ
    let result = convert_bitmaps_to_data_url(hbm_color, hbm_mask, icon_size);

    unsafe {
        if !hbm_color.is_null() {
            DeleteObject(hbm_color as _);
        }
        if !hbm_mask.is_null() {
            DeleteObject(hbm_mask as _);
        }
    }

    result
}

/// ビットマップハンドルからRGBAピクセルを生成し、PNG data URLに変換する
#[cfg(windows)]
fn convert_bitmaps_to_data_url(
    hbm_color: windows_sys::Win32::Graphics::Gdi::HBITMAP,
    hbm_mask: windows_sys::Win32::Graphics::Gdi::HBITMAP,
    icon_size: i32,
) -> Result<String, String> {
    use image::ImageBuffer;

    let pixel_count = (icon_size * icon_size) as usize;
    let color_pixels = extract_bitmap_bits(hbm_color, icon_size)?;
    let mask_pixels = extract_bitmap_bits(hbm_mask, icon_size);

    let mut rgba = vec![0u8; pixel_count * 4];
    let has_alpha = color_pixels.iter().skip(3).step_by(4).any(|&a| a != 0);

    for i in 0..pixel_count {
        let base = i * 4;
        rgba[base] = color_pixels[base + 2];
        rgba[base + 1] = color_pixels[base + 1];
        rgba[base + 2] = color_pixels[base];

        if has_alpha {
            rgba[base + 3] = color_pixels[base + 3];
        } else if let Ok(ref mask) = mask_pixels {
            let mask_val = mask[base];
            rgba[base + 3] = if mask_val == 0 { 255 } else { 0 };
        } else {
            rgba[base + 3] = 255;
        }
    }

    let img: ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(icon_size as u32, icon_size as u32, rgba)
            .ok_or("Failed to create image buffer")?;

    let mut png_buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let b64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        png_buf.into_inner(),
    );

    Ok(format!("data:image/png;base64,{}", b64))
}

#[cfg(windows)]
fn extract_bitmap_bits(
    hbm: windows_sys::Win32::Graphics::Gdi::HBITMAP,
    size: i32,
) -> Result<Vec<u8>, String> {
    use std::mem;
    use std::ptr;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS,
    };

    if hbm.is_null() {
        return Err("null bitmap".into());
    }

    let pixel_count = (size * size) as usize;
    let mut pixels = vec![0u8; pixel_count * 4];

    let mut bmi: BITMAPINFO = unsafe { mem::zeroed() };
    bmi.bmiHeader.biSize = mem::size_of::<BITMAPINFOHEADER>() as u32;
    bmi.bmiHeader.biWidth = size;
    bmi.bmiHeader.biHeight = -size; // top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    unsafe {
        let hdc = CreateCompatibleDC(ptr::null_mut());
        if hdc.is_null() {
            return Err("CreateCompatibleDC failed".into());
        }
        let old = SelectObject(hdc, hbm as _);
        let rows = GetDIBits(
            hdc,
            hbm,
            0,
            size as u32,
            pixels.as_mut_ptr() as *mut _,
            &mut bmi as *mut BITMAPINFO,
            DIB_RGB_COLORS,
        );
        SelectObject(hdc, old);
        DeleteDC(hdc);

        if rows == 0 {
            return Err("GetDIBits failed".into());
        }
    }

    Ok(pixels)
}

#[cfg(not(windows))]
fn get_shell_icon(_ext: &str) -> Result<String, String> {
    Err("Shell icons are only available on Windows".into())
}
