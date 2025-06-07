// lib/drive.ts
export function convertDriveUrlToDirectView(url: string): string {
    const match = url.match(/\/file\/d\/([^/]+)\//);
    if (match && match[1]) {
        return match ? `https://drive.google.com/uc?export=view&id=${match[1]}` : url
    }
    return url
}


  
}
