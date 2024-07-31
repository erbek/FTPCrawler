const fs = require('fs');
const { promisify } = require('util');
const { Client } = require('basic-ftp');
const async  = require('async');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

const IP_FILE_DIR = './FTP';
const OLD_IP_DIR = './FTP/old';
const MAX_CONCURRENT_TASKS = 20;

async function main() {
    const ipFile = process.argv[2];
    if (!ipFile) {
        console.log('Usage: node ftp_scanner.js <ip_file>');
        return;
    }

    try {
        const ipAddresses = await readIPAddresses(ipFile);
        await processIPAddresses(ipAddresses);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function readIPAddresses(ipFile) {
    const data = await fs.promises.readFile(ipFile, 'utf-8');
    return data.split('\n').map(ip => ip.trim()).filter(Boolean);
}

async function processIPAddresses(ipAddresses) {
    const queue = async.queue(async (ipAddress, callback) => {
        const oldFileExists = await checkOldFileExists(ipAddress);
        if (!oldFileExists) {
            await scanFTP(ipAddress);
        } else {
            console.log(`Skipping ${ipAddress} - Old file already exists.`);
        }
        callback();
    }, MAX_CONCURRENT_TASKS);

    for (const ipAddress of ipAddresses) {
        queue.push(ipAddress);
    }

    await new Promise((resolve, reject) => {
        queue.drain(() => {
            resolve();
        });
    });
}

async function checkOldFileExists(ipAddress) {
    const oldFilePath = `${OLD_IP_DIR}/${ipAddress}`;
    try {
        await fs.promises.access(oldFilePath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        } else {
            throw error;
        }
    }
}

async function scanFTP(ipAddress) {
    const client = new Client();
    const filePath = `${IP_FILE_DIR}/${ipAddress}`;
    let fileHandle = null;

    try {
        await client.access({
            host: ipAddress,
	    user:'anonymous',
		password:'myname@isjoey.com',
            secure: false,
        });
        }catch(error){
	        console.log(`		Error connecting to ${ipAddress}, error: ${error.message}`);
		return;
	}
	try{
        console.log(`Connected to ${ipAddress}`);
        await fs.promises.writeFile(filePath, ""); // Utwórz pusty plik dla IP

        fileHandle = await fs.promises.open(filePath, 'a'); // Otwórz plik do dopisywania
        await listDirectories(client, '/', fileHandle);
    } catch (error) {        
        // Zapisz komunikat o b³êdzie na koñcu pliku, jeœli istnieje uchwyt do pliku
        if (fileHandle) {
            await fileHandle.write("\n------NOT COMPLETED------\n");
        }
    } finally {
        if (fileHandle) {
            await fileHandle.close();
        }
        client.close();
    }
}

async function listDirectories(client, path, fileHandle, level = 0) {
    const items = await client.list(path);
    // Najpierw przetwarzaj i zapisuj tylko bie¿¹ce katalogi bez wg³êbiania siê.
    for (const item of items) {
        if (item.isDirectory) {
            const formattedDirectory = formatDirectory(path, item.name, level);
            await fileHandle.write(`${formattedDirectory}\n`);
        }
    }
    // Teraz rekurencyjnie przegl¹daj podkatalogi.
    for (const item of items) {
        if (item.isDirectory && level < 1) { // Aby ograniczyæ g³êbokoœæ, zastosowano warunek level < 1
            await listDirectories(client, `${path}/${item.name}`, fileHandle, level + 1);
        }
    }
}

async function saveDirectories(ipAddress, directories) {
    const filePath = `${IP_FILE_DIR}/${ipAddress}`;
    const formattedDirectories = formatDirectories(directories);
    const data = formattedDirectories.join('\n');
    await fs.promises.writeFile(filePath, data);
}

function formatDirectory(path, directoryName, level) {
    const indent = '  '.repeat(level);
    return `${indent}${path}${path === '/' ? '' : '/'}${directoryName}`;
}

main();
