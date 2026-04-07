export class ModalStore {
  image = $state({ open: false, index: 0 });
  video = $state({ open: false });
  audio = $state({ open: false });
  pdf = $state({ open: false, path: "" });
  epub = $state({ open: false, path: "" });
  webtoon = $state({
    open: false,
    cbzPath: "",
    contextPath: "",
  });
  folderPicker = $state({ open: false });

  get isAnyOpen() {
    return this.image.open || this.video.open || this.webtoon.open || this.audio.open || this.pdf.open || this.epub.open;
  }

  closeAll() {
    this.image.open = false;
    this.video.open = false;
    this.audio.open = false;
    this.pdf.open = false;
    this.epub.open = false;
    this.webtoon.open = false;
  }

  openPdf(path: string) {
    this.pdf.path = path;
    this.pdf.open = true;
  }

  openCbz(cbzPath: string, context = "") {
    this.webtoon.cbzPath = cbzPath;
    this.webtoon.contextPath = context;
    this.webtoon.open = true;
  }

  openEpub(path: string) {
    this.epub.path = path;
    this.epub.open = true;
  }
}
