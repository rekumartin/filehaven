declare module 'piexifjs' {
  /** [numerator, denominator] */
  type Rational = [number, number];
  type ExifValue = string | number | Rational[];

  /** A single IFD (image file directory) is a map of tag-id → value */
  type IFD = Record<number, ExifValue>;

  interface ExifData {
    '0th': IFD;
    Exif: IFD;
    GPS: IFD;
    Interop: IFD;
    '1st': IFD;
    thumbnail: string | null;
  }

  interface PiexifObject {
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    InteropIFD: Record<string, number>;
    load(jpegBinaryStr: string): Partial<ExifData>;
    dump(exifObj: Partial<ExifData>): string;
    insert(exifStr: string, jpegBinaryStr: string): string;
    remove(jpeg: string): string;
  }

  export type { ExifData, IFD, Rational, ExifValue };
  const piexif: PiexifObject;
  export default piexif;
}
