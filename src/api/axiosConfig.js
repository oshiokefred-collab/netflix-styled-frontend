import axios from 'axios';

export default axios.create({
    baseURL: 'http://ad24fc7cf37624cfab4e4b1b34b69c02-1752615503.us-east-1.elb.amazonaws.com:8080',
    headers: {
        'Content-Type': 'application/json',
    },
});