<?php
// Public short-request bridge for this game only. The upstream is never user supplied.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail_request($status, $error)
{
    http_response_code($status);
    echo json_encode(array('ok' => false, 'error' => $error));
    exit;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    fail_request(405, 'method_not_allowed');
}

$body = null;
if ($method === 'POST') {
    // Match the public site's origin exactly; no cookies or PHP sessions are used.
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin !== 'https://gms.gdl.jp') {
        fail_request(403, 'origin_not_allowed');
    }
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (strtolower(trim(explode(';', $contentType, 2)[0])) !== 'application/json') {
        fail_request(415, 'json_required');
    }
    if (isset($_SERVER['CONTENT_LENGTH']) && (float) $_SERVER['CONTENT_LENGTH'] > 16384) {
        fail_request(413, 'request_too_large');
    }
    // Check the real body as well as Content-Length, including chunked requests.
    $input = fopen('php://input', 'rb');
    $body = $input === false ? false : stream_get_contents($input, 16385);
    if ($input !== false) {
        fclose($input);
    }
    if (!is_string($body)) {
        fail_request(400, 'invalid_request');
    }
    if (strlen($body) > 16384) {
        fail_request(413, 'request_too_large');
    }
    $decoded = json_decode($body, false, 64);
    if (json_last_error() !== JSON_ERROR_NONE || !is_object($decoded)) {
        fail_request(400, 'invalid_json');
    }
}

if (!function_exists('curl_init')) {
    fail_request(503, 'server_unavailable');
}

$url = $method === 'POST'
    ? 'http://127.0.0.1:3001/api/room'
    : 'http://127.0.0.1:3001/health';
$request = curl_init($url);
if ($request === false) {
    fail_request(503, 'server_unavailable');
}

$responseBody = '';
$options = array(
    CURLOPT_CONNECTTIMEOUT_MS => 1000,
    CURLOPT_TIMEOUT_MS => 3000,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROXY => '',
    CURLOPT_HTTPHEADER => array('Accept: application/json'),
    CURLOPT_WRITEFUNCTION => function ($handle, $chunk) use (&$responseBody) {
        if (strlen($responseBody) + strlen($chunk) > 262144) {
            return 0;
        }
        $responseBody .= $chunk;
        return strlen($chunk);
    }
);
if ($method === 'POST') {
    $options[CURLOPT_POST] = true;
    $options[CURLOPT_POSTFIELDS] = $body;
    $options[CURLOPT_HTTPHEADER] = array(
        'Accept: application/json',
        'Content-Type: application/json',
        'Origin: https://gms.gdl.jp'
    );
}

if (!curl_setopt_array($request, $options)) {
    unset($request);
    fail_request(503, 'server_unavailable');
}
$completed = curl_exec($request);
$status = curl_getinfo($request, CURLINFO_HTTP_CODE);
unset($request);
$response = json_decode($responseBody, false, 64);
if ($completed === false || json_last_error() !== JSON_ERROR_NONE || !is_object($response)
    || $status < 200 || $status >= 600 || ($status >= 300 && $status < 400)) {
    fail_request(503, 'server_unavailable');
}

if ($method === 'GET') {
    if ($status !== 200 || !isset($response->ok) || $response->ok !== true
        || !isset($response->roomTransport) || $response->roomTransport !== 'http-polling-v1') {
        fail_request(503, 'server_unavailable');
    }
    echo json_encode(array('ok' => true, 'transport' => 'php-polling'));
    exit;
}

http_response_code($status);
echo $responseBody;
