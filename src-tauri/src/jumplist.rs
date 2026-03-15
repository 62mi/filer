/// Windows Jump List にカスタムタスク（「新しいウィンドウ」）とブックマーク一覧を追加する

#[cfg(windows)]
pub fn setup_jump_list() {
    update_jump_list_with_bookmarks(&[]);
}

/// ブックマーク一覧でジャンプリストを再構築する
#[cfg(windows)]
pub fn update_jump_list_with_bookmarks(bookmarks: &[(String, String)]) {
    if let Err(e) = build_jump_list(bookmarks) {
        eprintln!("Jump List 設定失敗: {e}");
    }
}

#[cfg(windows)]
fn build_jump_list(bookmarks: &[(String, String)]) -> windows::core::Result<()> {
    use std::env;
    use windows::core::{Interface, GUID, HSTRING};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
    };

    let pkey_title = PROPERTYKEY {
        fmtid: GUID {
            data1: 0xF29F85E0,
            data2: 0x4FF9,
            data3: 0x1068,
            data4: [0xAB, 0x91, 0x08, 0x00, 0x2B, 0x27, 0xB3, 0xD9],
        },
        pid: 2,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let dest_list: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let mut min_slots: u32 = 0;
        let _removed: IObjectArray = dest_list.BeginList(&mut min_slots)?;

        let exe_path = env::current_exe().map_err(|_| windows::core::Error::empty())?;
        let exe_hstring = HSTRING::from(exe_path.to_string_lossy().as_ref());

        // ── ブックマークカテゴリ ──
        if !bookmarks.is_empty() {
            let bm_collection: IObjectCollection =
                CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;

            for (name, path) in bookmarks.iter().take(min_slots as usize) {
                let link: IShellLinkW =
                    CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                link.SetPath(&exe_hstring)?;
                let args = format!("--open \"{}\"", path);
                link.SetArguments(&HSTRING::from(args.as_str()))?;
                // フォルダアイコンを使用
                link.SetIconLocation(
                    &HSTRING::from("shell32.dll"),
                    3, // フォルダアイコンのインデックス
                )?;

                set_shell_link_title(&link, name, &pkey_title)?;
                bm_collection.AddObject(&link)?;
            }

            let bm_array: IObjectArray = bm_collection.cast()?;
            dest_list.AppendCategory(&HSTRING::from("ブックマーク"), &bm_array)?;
        }

        // ── タスク: 「新しいウィンドウ」 ──
        let task_collection: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;

        let new_win_link: IShellLinkW =
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        new_win_link.SetPath(&exe_hstring)?;
        new_win_link.SetArguments(&HSTRING::from("--new-window"))?;
        new_win_link.SetIconLocation(&exe_hstring, 0)?;

        set_shell_link_title(&new_win_link, "新しいウィンドウ", &pkey_title)?;
        task_collection.AddObject(&new_win_link)?;

        let task_array: IObjectArray = task_collection.cast()?;
        dest_list.AddUserTasks(&task_array)?;
        dest_list.CommitList()?;
    }

    Ok(())
}

/// ShellLinkにタイトルを設定する共通ヘルパー
#[cfg(windows)]
unsafe fn set_shell_link_title(
    link: &windows::Win32::UI::Shell::IShellLinkW,
    title: &str,
    pkey_title: &windows::Win32::Foundation::PROPERTYKEY,
) -> windows::core::Result<()> {
    use windows::core::Interface;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

    let prop_store: IPropertyStore = link.cast()?;

    let title_wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    let byte_len = title_wide.len() * std::mem::size_of::<u16>();
    let ptr = windows::Win32::System::Com::CoTaskMemAlloc(byte_len) as *mut u16;
    std::ptr::copy_nonoverlapping(title_wide.as_ptr(), ptr, title_wide.len());

    let mut pv: PROPVARIANT = std::mem::zeroed();
    let pv_ptr = &mut pv as *mut PROPVARIANT as *mut u8;
    *(pv_ptr as *mut u16) = 31; // VT_LPWSTR
    *(pv_ptr.add(8) as *mut *mut u16) = ptr;

    prop_store.SetValue(pkey_title, &pv)?;
    prop_store.Commit()?;

    Ok(())
}
